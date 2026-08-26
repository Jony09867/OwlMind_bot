import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Users, Lock, Plus, LogOut, Crown, Radio, Clock, BookOpen, Send, UserPlus, Paperclip, MessageSquare, FileText, Image as ImageIcon } from 'lucide-react';
import { GlassCard, GlassButton, Badge, Modal, EmptyState } from './ui';
import { store, useStore } from '../store';
import { fmtHM } from '../hooks';
import { isSupabaseConfigured, supabase, type RoomRow, type RoomMemberRow, type RoomMessageRow, type RoomFileRow } from '../supabaseClient';
import { generateRoomCode, upsertTelegramUser } from '../lib/supabase';
import { getTelegramUserId, getTelegramUserName } from '../telegram';

type Tab = 'rooms' | 'chat' | 'files';

export function StudyRoomsView() {
  const profile = useStore((s) => s.profile);
  const joinedRoomId = useStore((s) => s.joinedRoomId);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [memberRoomIds, setMemberRoomIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<Tab>('rooms');

  const userId = getTelegramUserId() ?? 'local-user';
  const userName = profile.name && profile.name !== 'You' ? profile.name : (getTelegramUserName() ?? 'You');
  const userAvatar = profile.avatar || '🦉';

  // Load all rooms + aggregate member counts + this user's saved memberships.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setRooms([]);
      return;
    }

    let active = true;
    const loadRooms = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .order('created_at', { ascending: false });
      if (!active) return;
      if (error) {
        console.error('Failed to load rooms', error.message);
        setRooms([]);
      } else {
        setRooms(data ?? []);
      }
      setLoading(false);
    };

    const loadCounts = async () => {
      const { data, error } = await supabase
        .from('room_participants')
        .select('room_id');
      if (!active || error || !data) return;
      const counts: Record<string, number> = {};
      data.forEach((r: { room_id: string }) => {
        counts[r.room_id] = (counts[r.room_id] ?? 0) + 1;
      });
      setMemberCounts(counts);
    };

    const loadMyMemberships = async () => {
      const { data, error } = await supabase
        .from('room_participants')
        .select('room_id')
        .eq('user_id', userId);
      if (!active || error || !data) return;
      setMemberRoomIds(new Set(data.map((r: { room_id: string }) => r.room_id)));
    };

    loadRooms();
    loadCounts();
    loadMyMemberships();

    const channel = supabase
      .channel('rooms_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => loadRooms())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants' }, () => {
        loadCounts();
        loadMyMemberships();
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // Load members for the opened room + keep this user online while it is open.
  useEffect(() => {
    if (!joinedRoomId || !isSupabaseConfigured) {
      setMembers([]);
      return;
    }

    let active = true;
    const loadMembers = async () => {
      const { data, error } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_id', joinedRoomId)
        .order('joined_at', { ascending: true });
      if (!active || error) return;
      setMembers(data ?? []);
    };

    const markOnline = async () => {
      await supabase
        .from('room_participants')
        .update({ is_online: true })
        .eq('room_id', joinedRoomId)
        .eq('user_id', userId);
    };

    loadMembers();
    markOnline();

    const channel = supabase
      .channel(`room_participants_${joinedRoomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${joinedRoomId}` }, () => loadMembers())
      .subscribe();

    const onUnload = () => {
      supabase
        .from('room_participants')
        .update({ is_online: false })
        .eq('room_id', joinedRoomId!)
        .eq('user_id', userId);
    };
    window.addEventListener('beforeunload', onUnload);

    return () => {
      active = false;
      supabase.removeChannel(channel);
      window.removeEventListener('beforeunload', onUnload);
      onUnload();
    };
  }, [joinedRoomId, userId]);

  const joinedRoom = rooms.find((r) => r.id === joinedRoomId);

  const handleJoin = async (roomId: string) => {
    if (!isSupabaseConfigured) return;

    // If this room is already open, just switch to the members tab.
    if (joinedRoomId === roomId) {
      setTab('rooms');
      return;
    }

    const { data: existingMember, error: memberLookupError } = await supabase
      .from('room_participants')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle();
    if (memberLookupError) {
      console.error('Could not check room membership', memberLookupError.message);
      return;
    }

    if (!existingMember) {
      const { error } = await supabase.from('room_participants').insert({
        room_id: roomId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        subject: 'Study',
        elapsed_sec: 0,
        is_online: true,
      });
      if (error) {
        console.error('Could not join room', error.message);
        return;
      }
      setMemberRoomIds((current) => new Set(current).add(roomId));
    } else {
      const { error } = await supabase
        .from('room_participants')
        .update({ is_online: true, user_name: userName, user_avatar: userAvatar })
        .eq('room_id', roomId)
        .eq('user_id', userId);
      if (error) {
        console.error('Could not open room membership', error.message);
        return;
      }
      setMemberRoomIds((current) => new Set(current).add(roomId));
    }

    store.joinRoom(roomId);
    setTab('rooms');
  };

  const handleLeave = async () => {
    if (!joinedRoomId) return;
    await supabase
      .from('room_participants')
      .update({ is_online: false })
      .eq('room_id', joinedRoomId)
      .eq('user_id', userId);
    // Membership remains saved. The user can open the room later with one tap.
    store.leaveRoom();
    setMembers([]);
  };

  const visibleRooms = rooms.filter((r) => !r.is_private || r.owner_id === userId || memberRoomIds.has(r.id));
  const handleCreated = (room: RoomRow) => {
    setRooms((current) => [room, ...current.filter((r) => r.id !== room.id)]);
    setMemberCounts((current) => ({ ...current, [room.id]: 1 }));
    setMemberRoomIds((current) => new Set(current).add(room.id));
    void handleJoin(room.id);
  };

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="flex items-center justify-between px-1">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Study Rooms</h1>
          <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">Study together with friends.</p>
        </div>
         <div className="flex gap-2">
           <GlassButton size="sm" variant="neutral" icon={UserPlus} onClick={() => setShowJoin(true)}>Join</GlassButton>
           <GlassButton size="sm" icon={Plus} onClick={() => setShowCreate(true)}>Create</GlassButton>
         </div>
      </header>

      {joinedRoom && (
        <GlassCard strong className="p-5 animate-scale-in">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-xl font-bold">{joinedRoom.name}</h2>
                <Badge color="green"><Radio size={10} /> Live</Badge>
                {joinedRoom.is_private && <Lock size={12} className="text-neutralt-400" />}
              </div>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">Room code: <span className="font-bold tracking-widest">{joinedRoom.room_code}</span></p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5">
                {members.filter((m) => m.is_online).length} online · {members.length} members
              </p>
            </div>
            <div className="flex gap-2">
              <GlassButton size="sm" variant="neutral" icon={UserPlus} onClick={() => setShowInvite(true)}>Invite</GlassButton>
              <GlassButton size="sm" variant="neutral" icon={LogOut} onClick={handleLeave}>Leave</GlassButton>
            </div>
          </div>

          <div className="flex gap-1 glass-subtle rounded-2xl p-1 mb-4">
            {([
              { value: 'rooms', label: 'Members', icon: Users },
              { value: 'chat', label: 'Chat', icon: MessageSquare },
              { value: 'files', label: 'Files', icon: FileText },
            ] as const).map((t) => (
              <button
                key={t.value}
                onClick={() => setTab(t.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm font-semibold transition-all glass-press ${
                  tab === t.value ? 'bg-accent text-white shadow-glow' : 'text-neutralt-600 dark:text-neutralt-300'
                }`}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'rooms' && (
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="glass-subtle rounded-2xl p-3 flex items-center gap-3">
                  <div className="relative">
                    <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center text-lg">
                      {m.user_avatar || '🦉'}
                    </div>
                    {m.is_online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-tahoe-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm flex items-center gap-1.5">
                      {m.user_name}
                      {m.user_id === userId && <Badge color="accent">You</Badge>}
                      {joinedRoom.owner_id === m.user_id && <Crown size={12} className="text-amber-500" />}
                    </p>
                    <p className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1">
                      <BookOpen size={11} /> {m.subject}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-sm tabular-nums">{fmtHM(m.elapsed_sec)}</p>
                    <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">today</p>
                  </div>
                </div>
              ))}
              {members.length === 0 && <p className="text-sm text-neutralt-500 text-center py-4">No members yet.</p>}
            </div>
          )}

          {tab === 'chat' && <RoomChat roomId={joinedRoom.id} userId={userId} userName={userName} userAvatar={userAvatar} />}
          {tab === 'files' && <RoomFiles roomId={joinedRoom.id} userId={userId} userName={userName} userAvatar={userAvatar} />}
        </GlassCard>
      )}

      <div>
        <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-3 px-1">Discover Rooms</p>
        {!isSupabaseConfigured && (
          <p className="text-sm text-neutralt-500 text-center py-8">
            Study Rooms are unavailable until Supabase is connected.
          </p>
        )}
        {loading ? (
          <p className="text-sm text-neutralt-500 text-center py-8">Loading rooms…</p>
        ) : visibleRooms.length === 0 && !joinedRoom ? (
          <EmptyState icon={Users} title="No rooms available" subtitle="Create a room and invite friends." />
        ) : (
          <div className="space-y-3">
            {visibleRooms.map((r) => (
              <RoomCard
                key={r.id}
                room={r}
                joined={r.id === joinedRoomId}
                member={memberRoomIds.has(r.id)}
                memberCount={memberCounts[r.id] ?? 0}
                onOpen={() => handleJoin(r.id)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateRoomModal open={showCreate} onClose={() => setShowCreate(false)} userId={userId} userName={userName} userAvatar={userAvatar} onCreated={handleCreated} />
      <JoinRoomModal open={showJoin} onClose={() => setShowJoin(false)} onJoin={handleJoin} />
      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} roomId={joinedRoomId} userId={userId} />
    </div>
  );
}

function RoomCard({ room, joined, member, memberCount, onOpen }: { room: RoomRow; joined: boolean; member: boolean; memberCount: number; onOpen: () => void }) {
  return (
    <GlassCard className="p-0 overflow-hidden">
      <button type="button" onClick={onOpen} className="w-full p-4 text-left glass-press">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-display font-bold text-lg truncate">{room.name}</h3>
              {room.is_private && <Lock size={14} className="text-neutralt-400 shrink-0" />}
            </div>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5 flex items-center gap-1 flex-wrap">
              <Crown size={11} /> {room.owner_name} · {memberCount} members · <span className="font-bold tracking-wider">{room.room_code}</span>
            </p>
          </div>
          <span className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${joined ? 'bg-accent text-white' : member ? 'bg-accent/15 text-accent' : 'glass-subtle'}`}>
            {joined ? 'Open' : member ? 'Open' : 'Join'}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-neutralt-400/20">
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1">
            <Clock size={12} /> {fmtHM(room.total_study_sec)} total
          </span>
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400">{room.total_sessions} sessions</span>
        </div>
      </button>
    </GlassCard>
  );
}

function JoinRoomModal({ open, onClose, onJoin }: { open: boolean; onClose: () => void; onJoin: (roomId: string) => Promise<void> }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.from('rooms').select('id').eq('room_code', normalized).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Room not found');
      await onJoin(data.id);
      setCode('');
      onClose();
    } catch (cause) {
      console.error('Join room by code failed', cause);
      setErrorMsg(cause instanceof Error && cause.message === 'Room not found' ? 'Room code topilmadi.' : 'Room’ga qo‘shilib bo‘lmadi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Join a Study Room">
      <div className="space-y-4">
        <p className="text-sm text-neutralt-500 dark:text-neutralt-400">Do‘stingiz yuborgan room kodini kiriting.</p>
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          maxLength={6}
          placeholder="ABC123"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-bold tracking-[0.3em] uppercase outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        {errorMsg && <p className="text-sm text-red-500 text-center font-semibold">{errorMsg}</p>}
        <GlassButton className="w-full" onClick={submit} disabled={code.trim().length < 6 || loading}>
          {loading ? 'Joining…' : 'Join room'}
        </GlassButton>
      </div>
    </Modal>
  );
}

function CreateRoomModal({ open, onClose, userId, userName, userAvatar, onCreated }: { open: boolean; onClose: () => void; userId: string; userName: string; userAvatar: string; onCreated: (room: RoomRow) => void }) {
  const [name, setName] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const submit = async () => {
    if (!name.trim() || creating) return;
    if (!isSupabaseConfigured) {
      setErrorMsg('Database is not connected. Please check your setup.');
      return;
    }
    setCreating(true);
    setErrorMsg('');
    try {
      const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      if (telegramUser) {
        const { error: userError } = await upsertTelegramUser({
          id: userId,
          first_name: telegramUser.first_name || userName,
          username: telegramUser.username ?? null,
          photo_url: telegramUser.photo_url ?? null,
        });
        if (userError) throw userError;
      }
      const { data, error } = await supabase.from('rooms').insert({
        name: name.trim(),
        owner_id: userId,
        owner_name: userName,
        room_code: generateRoomCode(),
        is_private: isPrivate,
        subject: 'Study',
        total_study_sec: 0,
        total_sessions: 0,
      }).select().single();
      if (error || !data) throw new Error(error?.message || 'Could not create room');

      const { error: memberError } = await supabase.from('room_participants').insert({
        room_id: data.id,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        subject: 'Study',
        elapsed_sec: 0,
        is_online: true,
      });
      if (memberError) {
        await supabase.from('rooms').delete().eq('id', data.id);
        throw new Error(memberError.message);
      }
      setCreating(false);
      setName(''); setIsPrivate(false);
      onClose();
      onCreated(data as RoomRow);
    } catch (cause) {
      console.error('Create room failed', cause);
      setCreating(false);
      setErrorMsg('Room yaratib bo‘lmadi. Supabase jadvallari va RLS sozlamalarini tekshiring.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Study Room">
      <div className="space-y-4">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Room name" className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent" />
        <button onClick={() => setIsPrivate(!isPrivate)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
          <span className="flex items-center gap-2 text-sm font-medium"><Lock size={16} className="text-neutralt-500" /> Private room</span>
          <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${isPrivate ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        {errorMsg && <p className="text-sm text-red-500 text-center font-semibold">{errorMsg}</p>}
        <GlassButton className="w-full" onClick={submit} disabled={!name.trim() || creating}>{creating ? 'Creating…' : 'Create & Join'}</GlassButton>
      </div>
    </Modal>
  );
}

function InviteModal({ open, onClose, roomId, userId }: { open: boolean; onClose: () => void; roomId: string | null; userId: string }) {
  const [inviteeId, setInviteeId] = useState('');
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (!roomId || !inviteeId.trim()) return;
    await supabase.from('room_invites').insert({
      room_id: roomId,
      inviter_id: userId,
      invitee_id: inviteeId.trim(),
    });
    setDone(true);
    setTimeout(() => { setDone(false); setInviteeId(''); onClose(); }, 1500);
  };

  const copyLink = () => {
    if (!roomId) return;
    const url = `${window.location.origin}?join=${roomId}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setDone(true);
    setTimeout(() => { setDone(false); onClose(); }, 1500);
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite a friend">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mb-2">Invite by Telegram user id</p>
          <input value={inviteeId} onChange={(e) => setInviteeId(e.target.value)} placeholder="User id" className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent" />
        </div>
        <GlassButton className="w-full" onClick={submit} disabled={!inviteeId.trim()}>Send invite</GlassButton>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-neutralt-400/20" />
          <span className="text-xs text-neutralt-400">or</span>
          <div className="flex-1 h-px bg-neutralt-400/20" />
        </div>
        <GlassButton variant="neutral" className="w-full" onClick={copyLink}>Copy invite link</GlassButton>
        {done && <p className="text-sm text-green-500 text-center font-semibold">Done!</p>}
      </div>
    </Modal>
  );
}

function RoomChat({ roomId, userId, userName, userAvatar }: { roomId: string; userId: string; userName: string; userAvatar: string }) {
  const [messages, setMessages] = useState<RoomMessageRow[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    let active = true;
    (async () => {
      const { data, error } = await supabase.from('room_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200);
      if (!active) return;
      if (error) {
        console.error('Could not load room messages', error.message);
        setErrorMsg('Chat yuklanmadi.');
        setMessages([]);
      } else {
        setMessages(data ?? []);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`room_messages_${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        const incoming = payload.new as RoomMessageRow;
        setMessages((prev) => prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    if (!isSupabaseConfigured || sending) return;
    const text = body.trim();
    if (!text) return;
    setSending(true);
    setErrorMsg('');
    const { data, error } = await supabase.from('room_messages').insert({
      room_id: roomId,
      user_id: userId,
      user_name: userName,
      user_avatar: userAvatar,
      body: text,
    }).select().single();

    if (error || !data) {
      console.error('Could not send room message', error?.message);
      setErrorMsg('Xabar yuborilmadi. Qayta urinib ko‘ring.');
      setSending(false);
      return;
    }

    setBody('');
    setMessages((prev) => prev.some((m) => m.id === data.id) ? prev : [...prev, data as RoomMessageRow]);
    setSending(false);
  };

  return (
    <div className="flex flex-col h-72">
      <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hide space-y-2 pr-1">
        {loading ? (
          <p className="text-sm text-neutralt-500 text-center py-4">Loading…</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-neutralt-500 text-center py-8">No messages yet. Say hi!</p>
        ) : (
          messages.map((m) => {
            const mine = m.user_id === userId;
            return (
              <div key={m.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-base shrink-0">{m.user_avatar || '🦉'}</div>
                <div className={`max-w-[75%] ${mine ? 'items-end' : ''} flex flex-col`}>
                  {!mine && <span className="text-[10px] text-neutralt-500 mb-0.5 px-1">{m.user_name}</span>}
                  <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-accent text-white' : 'glass-subtle'}`}>
                    {m.body}
                  </div>
                  <span className="text-[9px] text-neutralt-400 mt-0.5 px-1">
                    {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
      {errorMsg && <p className="text-xs text-red-500 text-center mt-1 font-semibold">{errorMsg}</p>}
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-neutralt-400/20">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          className="flex-1 glass-subtle rounded-2xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        <button onClick={send} disabled={!body.trim() || sending} className="w-10 h-10 rounded-2xl bg-accent text-white flex items-center justify-center glass-press disabled:opacity-40">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function RoomFiles({ roomId, userId, userName, userAvatar }: { roomId: string; userId: string; userName: string; userAvatar: string }) {
  const [files, setFiles] = useState<RoomFileRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    (async () => {
      const { data } = await supabase.from('room_files').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100);
      if (!active) return;
      setFiles(data ?? []);
    })();

    const channel = supabase
      .channel(`room_files_${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_files', filter: `room_id=eq.${roomId}` }, (payload) => {
        setFiles((prev) => [payload.new as RoomFileRow, ...prev]);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const handleUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!isSupabaseConfigured) return;
    const file = e.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('room-files').upload(path, file, { upsert: false });
      if (upErr) {
        const url = URL.createObjectURL(file);
        await supabase.from('room_files').insert({
          room_id: roomId,
          user_id: userId,
          user_name: userName,
          user_avatar: userAvatar,
          file_name: file.name,
          file_url: url,
          file_type: file.type.startsWith('image/') ? 'image' : 'file',
          file_size: file.size,
        });
      } else {
        const { data: pub } = supabase.storage.from('room-files').getPublicUrl(path);
        await supabase.from('room_files').insert({
          room_id: roomId,
          user_id: userId,
          user_name: userName,
          user_avatar: userAvatar,
          file_name: file.name,
          file_url: pub.publicUrl,
          file_type: file.type.startsWith('image/') ? 'image' : 'file',
          file_size: file.size,
        });
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" onChange={handleUpload} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full glass-subtle rounded-2xl py-3 flex items-center justify-center gap-2 text-sm font-semibold glass-press disabled:opacity-50"
      >
        <Paperclip size={16} />
        {uploading ? 'Uploading…' : 'Upload file'}
      </button>
      {files.length === 0 ? (
        <p className="text-sm text-neutralt-500 text-center py-6">No files shared yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
          {files.map((f) => (
            <a key={f.id} href={f.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 glass-subtle rounded-2xl p-3 glass-press">
              <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent-500 flex items-center justify-center">
                {f.file_type === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{f.file_name}</p>
                <p className="text-xs text-neutralt-500 dark:text-neutralt-400">
                  {f.user_name} · {f.file_size > 0 ? `${(f.file_size / 1024).toFixed(1)} KB` : ''}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
