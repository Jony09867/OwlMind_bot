import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import {
  Users,
  Lock,
  Plus,
  LogOut,
  Crown,
  Radio,
  Clock,
  BookOpen,
  Send,
  UserPlus,
  Paperclip,
  MessageSquare,
  FileText,
  Image as ImageIcon,
  Settings,
  Shield,
  UserMinus,
  Inbox,
  History,
  Compass,
  Check,
  X,
  Trash2,
} from 'lucide-react';
import { GlassCard, GlassButton, Badge, Modal, EmptyState, SegmentedControl } from './ui';
import { store, useStore } from '../store';
import { fmtClock, fmtHM } from '../hooks';
import {
  isSupabaseConfigured,
  supabase,
  type RoomRow,
  type RoomMemberRow,
  type RoomMessageRow,
  type RoomFileRow,
} from '../supabaseClient';
import { generateRoomCode, upsertTelegramUser } from '../lib/supabase';
import { getTelegramStartParam, getTelegramUserId, getTelegramUserName, openTelegramLink } from '../telegram';

type Tab = 'rooms' | 'chat' | 'files';
type RoomListMode = 'mine' | 'discover';
type JoinResult = { ok: boolean; message?: string };
type RoomInviteRow = {
  id: string;
  room_id: string;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  accepted_at: string | null;
};
type UnreadRow = { room_id: string; unread_count: number | string };

const ROOM_FOCUS_STALE_MS = 6 * 60 * 60 * 1000;

function roomFocusElapsed(member: RoomMemberRow, now: number): number {
  const base = Math.max(0, Number(member.focus_elapsed_sec) || 0);
  if (member.focus_status !== 'focusing' || !member.focus_started_at) return base;
  const startedAt = new Date(member.focus_started_at).getTime();
  if (!Number.isFinite(startedAt)) return base;
  const deltaMs = Math.max(0, now - startedAt);
  if (deltaMs > ROOM_FOCUS_STALE_MS) return base;
  return base + Math.floor(deltaMs / 1000);
}

function isLiveFocusing(member: RoomMemberRow, now: number): boolean {
  if (member.focus_status !== 'focusing' || !member.focus_started_at) return false;
  const startedAt = new Date(member.focus_started_at).getTime();
  return Number.isFinite(startedAt) && now >= startedAt && now - startedAt <= ROOM_FOCUS_STALE_MS;
}

export function StudyRoomsView() {
  const profile = useStore((s) => s.profile);
  const joinedRoomId = useStore((s) => s.joinedRoomId);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [members, setMembers] = useState<RoomMemberRow[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [myMemberships, setMyMemberships] = useState<Record<string, RoomMemberRow>>({});
  const [pendingInvites, setPendingInvites] = useState<RoomInviteRow[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showJoin, setShowJoin] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [manageMember, setManageMember] = useState<RoomMemberRow | null>(null);
  const [tab, setTab] = useState<Tab>('rooms');
  const [roomListMode, setRoomListMode] = useState<RoomListMode>('mine');
  const [actionError, setActionError] = useState('');
  const [liveNow, setLiveNow] = useState(() => Date.now());
  const handledInviteRef = useRef<string | null>(null);

  const userId = getTelegramUserId() ?? 'local-user';
  const userName = profile.name && profile.name !== 'You' ? profile.name : (getTelegramUserName() ?? 'You');
  const userAvatar = profile.avatar || '🦉';

  const loadRooms = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.from('rooms').select('*').order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load rooms', error.message);
      return;
    }
    setRooms((data ?? []) as RoomRow[]);
  }, []);

  const loadCounts = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.from('room_participants').select('room_id');
    if (error || !data) return;
    const counts: Record<string, number> = {};
    data.forEach((row: { room_id: string }) => {
      counts[row.room_id] = (counts[row.room_id] ?? 0) + 1;
    });
    setMemberCounts(counts);
  }, []);

  const loadMyMemberships = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('room_participants')
      .select('*')
      .eq('user_id', userId);
    if (error || !data) return;
    const next: Record<string, RoomMemberRow> = {};
    (data as RoomMemberRow[]).forEach((membership) => {
      next[membership.room_id] = membership;
    });
    setMyMemberships(next);
  }, [userId]);

  const loadInvites = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('room_invites')
      .select('*')
      .eq('invitee_id', userId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (error || !data) return;
    setPendingInvites(data as RoomInviteRow[]);
  }, [userId]);

  const loadUnread = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.rpc('get_room_unread_counts', { p_user_id: userId });
    if (error || !data) return;
    const next: Record<string, number> = {};
    (data as UnreadRow[]).forEach((row) => {
      next[row.room_id] = Number(row.unread_count) || 0;
    });
    setUnreadCounts(next);
  }, [userId]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      setRooms([]);
      return;
    }

    let active = true;
    setLoading(true);
    void Promise.all([loadRooms(), loadCounts(), loadMyMemberships(), loadInvites(), loadUnread()]).finally(() => {
      if (active) setLoading(false);
    });

    const channel = supabase
      .channel(`rooms_foundation_${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms' }, () => void loadRooms())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants' }, () => {
        void loadCounts();
        void loadMyMemberships();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_invites', filter: `invitee_id=eq.${userId}` }, () => void loadInvites())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages' }, () => void loadUnread())
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [loadCounts, loadInvites, loadMyMemberships, loadRooms, loadUnread, userId]);

  useEffect(() => {
    if (!loading && Object.keys(myMemberships).length === 0 && pendingInvites.length === 0) {
      setRoomListMode('discover');
    }
  }, [loading, myMemberships, pendingInvites.length]);

  useEffect(() => {
    const hasRunningFocus = members.some((member) => isLiveFocusing(member, Date.now()));
    if (!hasRunningFocus) return;
    setLiveNow(Date.now());
    const timer = window.setInterval(() => setLiveNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [members]);

  useEffect(() => {
    if (!joinedRoomId || !isSupabaseConfigured) {
      setMembers([]);
      setMembersLoaded(false);
      return;
    }

    let active = true;
    setMembersLoaded(false);

    const loadMembers = async () => {
      const { data, error } = await supabase
        .from('room_participants')
        .select('*')
        .eq('room_id', joinedRoomId)
        .order('joined_at', { ascending: true });
      if (!active || error) return;
      setMembers((data ?? []) as RoomMemberRow[]);
      setMembersLoaded(true);
    };

    const markOnline = async () => {
      await supabase
        .from('room_participants')
        .update({ is_online: true, last_opened_at: new Date().toISOString() })
        .eq('room_id', joinedRoomId)
        .eq('user_id', userId);
    };

    void loadMembers();
    void markOnline();

    const channel = supabase
      .channel(`room_participants_${joinedRoomId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_participants', filter: `room_id=eq.${joinedRoomId}` }, () => void loadMembers())
      .subscribe();

    const onUnload = () => {
      void supabase
        .from('room_participants')
        .update({
          is_online: false,
          focus_status: 'idle',
          focus_type: null,
          focus_started_at: null,
          focus_elapsed_sec: 0,
        })
        .eq('room_id', joinedRoomId)
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

  useEffect(() => {
    if (!joinedRoomId || !membersLoaded) return;
    if (!members.some((member) => member.user_id === userId)) {
      store.leaveRoom();
      setMembers([]);
      setTab('rooms');
      setActionError('You are no longer a member of this room.');
    }
  }, [joinedRoomId, members, membersLoaded, userId]);

  const markRoomRead = useCallback(async (roomId: string) => {
    if (!isSupabaseConfigured) return;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('room_participants')
      .update({ last_read_at: now })
      .eq('room_id', roomId)
      .eq('user_id', userId);
    if (error) return;
    setUnreadCounts((current) => ({ ...current, [roomId]: 0 }));
    setMyMemberships((current) => {
      const membership = current[roomId];
      if (!membership) return current;
      return { ...current, [roomId]: { ...membership, last_read_at: now } };
    });
  }, [userId]);

  const joinedRoom = rooms.find((room) => room.id === joinedRoomId);
  const currentUnread = joinedRoomId ? (unreadCounts[joinedRoomId] ?? 0) : 0;
  const isOwner = Boolean(joinedRoom && joinedRoom.owner_id === userId);

  const handleOpenRoom = useCallback(async (roomId: string): Promise<JoinResult> => {
    if (!isSupabaseConfigured) return { ok: false, message: 'Database is not connected.' };

    setActionError('');
    const room = rooms.find((item) => item.id === roomId);
    if (!room) return { ok: false, message: 'Room not found.' };

    if (joinedRoomId === roomId && myMemberships[roomId]) {
      setTab('rooms');
      return { ok: true };
    }

    if (joinedRoomId && joinedRoomId !== roomId) {
      await supabase
        .from('room_participants')
        .update({
          is_online: false,
          focus_status: 'idle',
          focus_type: null,
          focus_started_at: null,
          focus_elapsed_sec: 0,
        })
        .eq('room_id', joinedRoomId)
        .eq('user_id', userId);
    }

    const existingMember = myMemberships[roomId];
    const pendingInvite = pendingInvites.find((invite) => invite.room_id === roomId);

    if (!existingMember && room.is_private && room.owner_id !== userId && !pendingInvite) {
      const message = 'This private room requires an invitation.';
      setActionError(message);
      return { ok: false, message };
    }

    if (!existingMember && (memberCounts[roomId] ?? 0) >= room.member_limit) {
      const message = 'This room is full.';
      setActionError(message);
      return { ok: false, message };
    }

    const now = new Date().toISOString();
    if (!existingMember) {
      const { error } = await supabase.from('room_participants').insert({
        room_id: roomId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        subject: room.subject || 'Study',
        role: room.owner_id === userId ? 'owner' : 'member',
        elapsed_sec: 0,
        is_online: true,
        last_opened_at: now,
        last_read_at: now,
      });
      if (error) {
        const message = error.message.includes('Room is full') ? 'This room is full.' : 'Could not join this room.';
        console.error('Could not join room', error.message);
        setActionError(message);
        return { ok: false, message };
      }
    } else {
      const { error } = await supabase
        .from('room_participants')
        .update({ is_online: true, user_name: userName, user_avatar: userAvatar, last_opened_at: now })
        .eq('room_id', roomId)
        .eq('user_id', userId);
      if (error) {
        console.error('Could not open room membership', error.message);
        const message = 'Could not open this room.';
        setActionError(message);
        return { ok: false, message };
      }
    }

    if (pendingInvite) {
      await supabase
        .from('room_invites')
        .update({ status: 'accepted', accepted_at: now })
        .eq('id', pendingInvite.id);
    }

    await Promise.all([loadMyMemberships(), loadCounts(), loadInvites(), loadUnread()]);
    store.joinRoom(roomId);
    setRoomListMode('mine');
    setTab('rooms');
    return { ok: true };
  }, [joinedRoomId, loadCounts, loadInvites, loadMyMemberships, loadUnread, memberCounts, myMemberships, pendingInvites, rooms, userAvatar, userId, userName]);

  useEffect(() => {
    if (!isSupabaseConfigured || rooms.length === 0) return;

    const queryToken = new URLSearchParams(window.location.search).get('join')?.trim() ?? null;
    const startParam = getTelegramStartParam();
    const startToken = startParam?.startsWith('room_') ? startParam.slice(5).trim() : null;
    const token = queryToken || startToken;
    if (!token || handledInviteRef.current === token) return;

    const room = rooms.find((item) => item.id === token || item.room_code === token.toUpperCase());
    if (!room) return;

    handledInviteRef.current = token;
    void handleOpenRoom(room.id).then((result) => {
      if (!result.ok) return;
      if (queryToken) {
        const url = new URL(window.location.href);
        url.searchParams.delete('join');
        window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
      }
    });
  }, [handleOpenRoom, rooms]);

  const handleCloseRoom = async () => {
    if (!joinedRoomId) return;
    await supabase
      .from('room_participants')
      .update({
        is_online: false,
        focus_status: 'idle',
        focus_type: null,
        focus_started_at: null,
        focus_elapsed_sec: 0,
      })
      .eq('room_id', joinedRoomId)
      .eq('user_id', userId);
    store.leaveRoom();
    setMembers([]);
    setMembersLoaded(false);
  };

  const handleDeclineInvite = async (invite: RoomInviteRow) => {
    setActionError('');
    const { error } = await supabase
      .from('room_invites')
      .update({ status: 'declined' })
      .eq('id', invite.id);
    if (error) {
      setActionError('Could not decline the invitation.');
      return;
    }
    await loadInvites();
  };

  const handleRoleChange = async (member: RoomMemberRow, role: 'admin' | 'member'): Promise<boolean> => {
    if (!joinedRoom || joinedRoom.owner_id !== userId || member.user_id === joinedRoom.owner_id) return false;
    const { error } = await supabase
      .from('room_participants')
      .update({ role })
      .eq('id', member.id)
      .eq('room_id', joinedRoom.id);
    if (error) {
      setActionError('Could not update member role.');
      return false;
    }
    setMembers((current) => current.map((item) => item.id === member.id ? { ...item, role } : item));
    return true;
  };

  const handleRemoveMember = async (member: RoomMemberRow): Promise<boolean> => {
    if (!joinedRoom || joinedRoom.owner_id !== userId || member.user_id === joinedRoom.owner_id) return false;
    const { error } = await supabase
      .from('room_participants')
      .delete()
      .eq('id', member.id)
      .eq('room_id', joinedRoom.id);
    if (error) {
      setActionError('Could not remove this member.');
      return false;
    }
    setMembers((current) => current.filter((item) => item.id !== member.id));
    setMemberCounts((current) => ({ ...current, [joinedRoom.id]: Math.max(0, (current[joinedRoom.id] ?? 1) - 1) }));
    return true;
  };

  const handleRoomUpdated = (updated: RoomRow) => {
    setRooms((current) => current.map((room) => room.id === updated.id ? updated : room));
  };

  const handleRoomDeleted = async (roomId: string) => {
    setRooms((current) => current.filter((room) => room.id !== roomId));
    setShowSettings(false);
    if (joinedRoomId === roomId) {
      store.leaveRoom();
      setMembers([]);
      setMembersLoaded(false);
    }
    await Promise.all([loadMyMemberships(), loadCounts(), loadInvites(), loadUnread()]);
  };

  const handleCreated = async (room: RoomRow) => {
    setRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
    await Promise.all([loadMyMemberships(), loadCounts()]);
    store.joinRoom(room.id);
    setRoomListMode('mine');
    setTab('rooms');
  };

  const handleRoomTab = (next: Tab) => {
    setTab(next);
    if (next === 'chat' && joinedRoomId) void markRoomRead(joinedRoomId);
  };

  const memberRoomIds = new Set(Object.keys(myMemberships));
  const invitedRoomIds = new Set(pendingInvites.map((invite) => invite.room_id));
  const visibleRooms = rooms.filter((room) => !room.is_private || room.owner_id === userId || memberRoomIds.has(room.id) || invitedRoomIds.has(room.id));
  const pendingInviteCards = pendingInvites
    .map((invite) => ({ invite, room: rooms.find((room) => room.id === invite.room_id) }))
    .filter((item): item is { invite: RoomInviteRow; room: RoomRow } => Boolean(item.room));
  const myRooms = visibleRooms
    .filter((room) => memberRoomIds.has(room.id))
    .sort((a, b) => {
      const aTime = new Date(myMemberships[a.id]?.last_opened_at ?? a.created_at).getTime();
      const bTime = new Date(myMemberships[b.id]?.last_opened_at ?? b.created_at).getTime();
      return bTime - aTime;
    });
  const recentRooms = myRooms.slice(0, 3);
  const moreRooms = myRooms.slice(3);
  const discoverRooms = visibleRooms.filter((room) => !memberRoomIds.has(room.id) && !invitedRoomIds.has(room.id) && !room.is_private);

  return (
    <div className="space-y-5 animate-fade-in pb-4">
      <header className="flex items-center justify-between px-1 gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-extrabold tracking-tight">Study Rooms</h1>
          <p className="text-neutralt-500 dark:text-neutralt-400 text-sm mt-1">Study together with friends.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <GlassButton size="sm" variant="neutral" icon={UserPlus} onClick={() => setShowJoin(true)}>Join</GlassButton>
          <GlassButton size="sm" icon={Plus} onClick={() => setShowCreate(true)}>Create</GlassButton>
        </div>
      </header>

      {actionError && (
        <p className="text-sm text-red-500 text-center font-semibold px-2">{actionError}</p>
      )}

      {joinedRoom && (
        <GlassCard strong className="p-5 animate-scale-in">
          <div className="flex items-start justify-between mb-4 gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="font-display text-xl font-bold truncate">{joinedRoom.name}</h2>
                <Badge color="green"><Radio size={10} /> Live</Badge>
                {joinedRoom.is_private && <Lock size={12} className="text-neutralt-400" />}
              </div>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1 flex items-center gap-1">
                <BookOpen size={11} /> {joinedRoom.subject || 'Study'}
              </p>
              {joinedRoom.description && (
                <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1 line-clamp-2">{joinedRoom.description}</p>
              )}
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">Room code: <span className="font-bold tracking-widest">{joinedRoom.room_code}</span></p>
              <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5">
                {members.filter((member) => member.is_online).length} online · {members.length}/{joinedRoom.member_limit} members
              </p>
            </div>
            <div className="flex gap-2 shrink-0 flex-wrap justify-end">
              {isOwner && (
                <GlassButton size="sm" variant="neutral" icon={Settings} onClick={() => setShowSettings(true)} aria-label="Room settings" title="Room settings" />
              )}
              <GlassButton size="sm" variant="neutral" icon={UserPlus} onClick={() => setShowInvite(true)}>Invite</GlassButton>
              <GlassButton size="sm" variant="neutral" icon={LogOut} onClick={handleCloseRoom}>Leave</GlassButton>
            </div>
          </div>

          <div className="flex gap-1 glass-subtle rounded-2xl p-1 mb-4">
            {([
              { value: 'rooms', label: 'Members', icon: Users },
              { value: 'chat', label: 'Chat', icon: MessageSquare },
              { value: 'files', label: 'Files', icon: FileText },
            ] as const).map((item) => (
              <button
                key={item.value}
                onClick={() => handleRoomTab(item.value)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-sm font-semibold transition-all glass-press ${
                  tab === item.value ? 'bg-accent text-white shadow-glow' : 'text-neutralt-600 dark:text-neutralt-300'
                }`}
              >
                <item.icon size={15} />
                {item.label}
                {item.value === 'chat' && currentUnread > 0 && (
                  <span className={`min-w-5 h-5 px-1 rounded-full text-[10px] flex items-center justify-center ${tab === 'chat' ? 'bg-white/20 text-white' : 'bg-accent/15 text-accent'}`}>
                    {currentUnread > 99 ? '99+' : currentUnread}
                  </span>
                )}
              </button>
            ))}
          </div>

          {tab === 'rooms' && (
            <div className="space-y-2">
              {members.map((member) => {
                const focusing = isLiveFocusing(member, liveNow);
                const paused = member.focus_status === 'paused';
                const focusElapsed = roomFocusElapsed(member, liveNow);
                return (
                  <div key={member.id} className="glass-subtle rounded-2xl p-3 flex items-center gap-3">
                    <div className="relative shrink-0">
                      <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center text-lg">
                        {member.user_avatar || '🦉'}
                      </div>
                      {member.is_online && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white dark:border-tahoe-300" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                        {member.user_name}
                        {member.user_id === userId && <Badge color="accent">You</Badge>}
                        {(member.role === 'owner' || joinedRoom.owner_id === member.user_id) && <Crown size={12} className="text-amber-500" />}
                        {member.role === 'admin' && <Badge color="neutral">Admin</Badge>}
                      </p>
                      <p className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1 flex-wrap">
                        <BookOpen size={11} />
                        <span className="min-w-0 truncate">{member.subject}</span>
                        {focusing && (
                          <>
                            <span>·</span>
                            <span className="text-accent font-semibold whitespace-nowrap">Focusing · {fmtClock(focusElapsed)}</span>
                          </>
                        )}
                        {!focusing && paused && (
                          <>
                            <span>·</span>
                            <span className="font-semibold whitespace-nowrap">Paused · {fmtClock(focusElapsed)}</span>
                          </>
                        )}
                      </p>
                      {isOwner && member.user_id !== joinedRoom.owner_id && (
                        <div className="mt-2">
                          <GlassButton size="sm" variant="neutral" icon={Shield} onClick={() => setManageMember(member)}>Manage</GlassButton>
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-sm tabular-nums">{fmtHM(member.elapsed_sec)}</p>
                      <p className="text-[10px] text-neutralt-500 dark:text-neutralt-400">today</p>
                    </div>
                  </div>
                );
              })}
              {members.length === 0 && <p className="text-sm text-neutralt-500 text-center py-4">No members yet.</p>}
            </div>
          )}

          {tab === 'chat' && (
            <RoomChat
              roomId={joinedRoom.id}
              userId={userId}
              userName={userName}
              userAvatar={userAvatar}
              onRead={markRoomRead}
            />
          )}
          {tab === 'files' && <RoomFiles roomId={joinedRoom.id} userId={userId} userName={userName} userAvatar={userAvatar} />}
        </GlassCard>
      )}

      {pendingInviteCards.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-3 px-1 flex items-center gap-1.5">
            <Inbox size={13} /> Invitations
          </p>
          <div className="space-y-3">
            {pendingInviteCards.map(({ invite, room }) => (
              <InvitationCard
                key={invite.id}
                room={room}
                full={(memberCounts[room.id] ?? 0) >= room.member_limit}
                memberCount={memberCounts[room.id] ?? 0}
                onAccept={() => void handleOpenRoom(room.id)}
                onDecline={() => void handleDeclineInvite(invite)}
              />
            ))}
          </div>
        </div>
      )}

      <SegmentedControl
        options={[
          { value: 'mine', label: 'My Rooms', icon: Users },
          { value: 'discover', label: 'Discover', icon: Compass },
        ]}
        value={roomListMode}
        onChange={setRoomListMode}
      />

      {loading ? (
        <p className="text-sm text-neutralt-500 text-center py-8">Loading rooms…</p>
      ) : roomListMode === 'mine' ? (
        myRooms.length === 0 ? (
          <EmptyState icon={Users} title="No joined rooms yet" subtitle="Join a room or create your own study space." />
        ) : (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-3 px-1 flex items-center gap-1.5">
                <History size={13} /> Recent Rooms
              </p>
              <div className="space-y-3">
                {recentRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    joined={room.id === joinedRoomId}
                    member
                    invited={false}
                    unread={unreadCounts[room.id] ?? 0}
                    memberCount={memberCounts[room.id] ?? 0}
                    onOpen={() => void handleOpenRoom(room.id)}
                  />
                ))}
              </div>
            </div>

            {moreRooms.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-3 px-1">More Rooms</p>
                <div className="space-y-3">
                  {moreRooms.map((room) => (
                    <RoomCard
                      key={room.id}
                      room={room}
                      joined={room.id === joinedRoomId}
                      member
                      invited={false}
                      unread={unreadCounts[room.id] ?? 0}
                      memberCount={memberCounts[room.id] ?? 0}
                      onOpen={() => void handleOpenRoom(room.id)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      ) : discoverRooms.length === 0 ? (
        <EmptyState icon={Users} title="No public rooms available" subtitle="Create a public room and invite friends." />
      ) : (
        <div>
          <p className="text-xs font-semibold text-neutralt-500 dark:text-neutralt-400 uppercase tracking-wide mb-3 px-1">Discover Rooms</p>
          <div className="space-y-3">
            {discoverRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                joined={false}
                member={false}
                invited={false}
                unread={0}
                memberCount={memberCounts[room.id] ?? 0}
                onOpen={() => void handleOpenRoom(room.id)}
              />
            ))}
          </div>
        </div>
      )}

      {!isSupabaseConfigured && (
        <p className="text-sm text-neutralt-500 text-center py-4">Study Rooms are unavailable until Supabase is connected.</p>
      )}

      <CreateRoomModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        userId={userId}
        userName={userName}
        userAvatar={userAvatar}
        onCreated={handleCreated}
      />
      <JoinRoomModal open={showJoin} onClose={() => setShowJoin(false)} onJoin={handleOpenRoom} />
      <InviteModal
        open={showInvite}
        onClose={() => setShowInvite(false)}
        roomId={joinedRoomId}
        roomCode={joinedRoom?.room_code ?? null}
        roomName={joinedRoom?.name ?? null}
        userId={userId}
      />
      <RoomSettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        room={joinedRoom ?? null}
        memberCount={joinedRoom ? (memberCounts[joinedRoom.id] ?? 0) : 0}
        onUpdated={handleRoomUpdated}
        onDeleted={handleRoomDeleted}
      />
      <MemberManageModal
        member={manageMember}
        onClose={() => setManageMember(null)}
        onRoleChange={handleRoleChange}
        onRemove={handleRemoveMember}
      />
    </div>
  );
}

function RoomCard({
  room,
  joined,
  member,
  invited,
  unread,
  memberCount,
  onOpen,
}: {
  room: RoomRow;
  joined: boolean;
  member: boolean;
  invited: boolean;
  unread: number;
  memberCount: number;
  onOpen: () => void;
}) {
  const full = memberCount >= room.member_limit;
  return (
    <GlassCard className="p-0 overflow-hidden">
      <button type="button" onClick={onOpen} disabled={!member && full} className="w-full p-4 text-left glass-press disabled:opacity-60">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-bold text-lg truncate">{room.name}</h3>
              {room.is_private && <Lock size={14} className="text-neutralt-400 shrink-0" />}
              {invited && <Badge color="accent">Invited</Badge>}
              {unread > 0 && <Badge color="accent">{unread > 99 ? '99+' : unread} new</Badge>}
            </div>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-0.5 flex items-center gap-1 flex-wrap">
              <Crown size={11} /> {room.owner_name} · {memberCount}/{room.member_limit} members · <span className="font-bold tracking-wider">{room.room_code}</span>
            </p>
          </div>
          <span className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold ${joined ? 'bg-accent text-white' : member ? 'bg-accent/15 text-accent' : 'glass-subtle'}`}>
            {member ? 'Open' : full ? 'Full' : 'Join'}
          </span>
        </div>
        {room.description && <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mb-3 line-clamp-2">{room.description}</p>}
        <div className="flex items-center gap-4 mt-3 pt-3 border-t border-neutralt-400/20 flex-wrap">
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1">
            <BookOpen size={12} /> {room.subject || 'Study'}
          </span>
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 flex items-center gap-1">
            <Clock size={12} /> {fmtHM(room.total_study_sec)} total
          </span>
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400">{room.total_sessions} sessions</span>
        </div>
      </button>
    </GlassCard>
  );
}

function InvitationCard({
  room,
  full,
  memberCount,
  onAccept,
  onDecline,
}: {
  room: RoomRow;
  full: boolean;
  memberCount: number;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-display font-bold text-lg truncate">{room.name}</h3>
            {room.is_private && <Lock size={14} className="text-neutralt-400" />}
            <Badge color="accent">Invited</Badge>
          </div>
          <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1">
            {room.owner_name} · {memberCount}/{room.member_limit} members · {room.subject || 'Study'}
          </p>
          {room.description && <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1 line-clamp-2">{room.description}</p>}
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        <GlassButton size="sm" className="flex-1" icon={Check} disabled={full} onClick={onAccept}>{full ? 'Room full' : 'Accept'}</GlassButton>
        <GlassButton size="sm" className="flex-1" variant="neutral" icon={X} onClick={onDecline}>Decline</GlassButton>
      </div>
    </GlassCard>
  );
}

function JoinRoomModal({ open, onClose, onJoin }: { open: boolean; onClose: () => void; onJoin: (roomId: string) => Promise<JoinResult> }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) {
      setCode('');
      setErrorMsg('');
      setLoading(false);
    }
  }, [open]);

  const submit = async () => {
    const normalized = code.trim().toUpperCase();
    if (!normalized || loading) return;
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase.from('rooms').select('id').eq('room_code', normalized).maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Room not found');
      const result = await onJoin(data.id);
      if (!result.ok) {
        setErrorMsg(result.message || 'Room’ga qo‘shilib bo‘lmadi.');
        return;
      }
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
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          onKeyDown={(event) => event.key === 'Enter' && void submit()}
          maxLength={6}
          placeholder="ABC123"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-bold tracking-[0.3em] uppercase outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        {errorMsg && <p className="text-sm text-red-500 text-center font-semibold">{errorMsg}</p>}
        <GlassButton className="w-full" onClick={() => void submit()} disabled={code.trim().length < 6 || loading}>
          {loading ? 'Joining…' : 'Join room'}
        </GlassButton>
      </div>
    </Modal>
  );
}

function CreateRoomModal({
  open,
  onClose,
  userId,
  userName,
  userAvatar,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  userAvatar: string;
  onCreated: (room: RoomRow) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Study');
  const [memberLimit, setMemberLimit] = useState(10);
  const [isPrivate, setIsPrivate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) {
      setName('');
      setDescription('');
      setSubject('Study');
      setMemberLimit(10);
      setIsPrivate(false);
      setErrorMsg('');
      setCreating(false);
    }
  }, [open]);

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

      const safeLimit = Math.min(10, Math.max(2, Math.floor(memberLimit || 10)));
      const { data, error } = await supabase.from('rooms').insert({
        name: name.trim(),
        description: description.trim(),
        owner_id: userId,
        owner_name: userName,
        room_code: generateRoomCode(),
        is_private: isPrivate,
        subject: subject.trim() || 'Study',
        member_limit: safeLimit,
        total_study_sec: 0,
        total_sessions: 0,
      }).select().single();
      if (error || !data) throw new Error(error?.message || 'Could not create room');

      const now = new Date().toISOString();
      const { error: memberError } = await supabase.from('room_participants').insert({
        room_id: data.id,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        subject: subject.trim() || 'Study',
        role: 'owner',
        elapsed_sec: 0,
        is_online: true,
        last_opened_at: now,
        last_read_at: now,
      });
      if (memberError) {
        await supabase.from('rooms').delete().eq('id', data.id);
        throw new Error(memberError.message);
      }

      await onCreated(data as RoomRow);
      onClose();
    } catch (cause) {
      console.error('Create room failed', cause);
      setErrorMsg('Room yaratib bo‘lmadi. Qayta urinib ko‘ring.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Create Study Room">
      <div className="space-y-4">
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Room name"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={60}
          placeholder="Subject (e.g. IELTS, Math)"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={240}
          rows={3}
          placeholder="Short room description (optional)"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent resize-none"
        />
        <label className="glass-subtle rounded-2xl px-4 py-3 block">
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 block mb-1">Member limit</span>
          <input
            type="number"
            min={2}
            max={10}
            value={memberLimit}
            onChange={(event) => setMemberLimit(Math.min(10, Math.max(2, Number(event.target.value) || 2)))}
            className="w-full bg-transparent font-bold outline-none"
          />
        </label>
        <button onClick={() => setIsPrivate(!isPrivate)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
          <span className="flex items-center gap-2 text-sm font-medium"><Lock size={16} className="text-neutralt-500" /> Private room</span>
          <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${isPrivate ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-4' : ''}`} />
          </span>
        </button>
        {errorMsg && <p className="text-sm text-red-500 text-center font-semibold">{errorMsg}</p>}
        <GlassButton className="w-full" onClick={() => void submit()} disabled={!name.trim() || creating}>{creating ? 'Creating…' : 'Create & Join'}</GlassButton>
      </div>
    </Modal>
  );
}

function InviteModal({
  open,
  onClose,
  roomId,
  roomCode,
  roomName,
  userId,
}: {
  open: boolean;
  onClose: () => void;
  roomId: string | null;
  roomCode: string | null;
  roomName: string | null;
  userId: string;
}) {
  const [inviteeId, setInviteeId] = useState('');
  const [feedback, setFeedback] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) {
      setInviteeId('');
      setFeedback('');
      setSending(false);
    }
  }, [open]);

  const buildInviteLink = () => {
    if (!roomCode) return '';
    const configuredBase = (import.meta.env.VITE_TELEGRAM_APP_URL as string | undefined)?.trim();
    if (configuredBase) {
      const separator = configuredBase.includes('?') ? '&' : '?';
      return `${configuredBase}${separator}startapp=room_${encodeURIComponent(roomCode)}`;
    }
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('join', roomCode);
    return url.toString();
  };

  const submit = async () => {
    if (!roomId || !inviteeId.trim() || sending) return;
    setSending(true);
    setFeedback('');
    const normalizedId = inviteeId.trim();
    if (normalizedId === userId) {
      setFeedback('O‘zingizni taklif qila olmaysiz.');
      setSending(false);
      return;
    }

    const { error } = await supabase.from('room_invites').insert({
      room_id: roomId,
      inviter_id: userId,
      invitee_id: normalizedId,
      status: 'pending',
    });
    if (error) {
      setFeedback(error.message.toLowerCase().includes('duplicate') ? 'Bu foydalanuvchiga taklif allaqachon yuborilgan.' : 'Taklif yuborilmadi.');
      setSending(false);
      return;
    }
    setInviteeId('');
    setFeedback('Invite sent!');
    setSending(false);
  };

  const shareTelegram = () => {
    const link = buildInviteLink();
    if (!link) return;
    const text = `Join ${roomName || 'my study room'} on OwlMind`;
    openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  };

  const copyLink = async () => {
    const link = buildInviteLink();
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setFeedback('Link copied!');
    } catch {
      setFeedback('Linkni nusxalab bo‘lmadi.');
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite a friend">
      <div className="space-y-4">
        <div>
          <p className="text-sm text-neutralt-500 dark:text-neutralt-400 mb-2">Invite by Telegram user id</p>
          <input
            value={inviteeId}
            onChange={(event) => setInviteeId(event.target.value)}
            placeholder="User id"
            className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
          />
        </div>
        <GlassButton className="w-full" onClick={() => void submit()} disabled={!inviteeId.trim() || sending}>{sending ? 'Sending…' : 'Send invite'}</GlassButton>
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-neutralt-400/20" />
          <span className="text-xs text-neutralt-400">or</span>
          <div className="flex-1 h-px bg-neutralt-400/20" />
        </div>
        <GlassButton variant="neutral" className="w-full" onClick={shareTelegram}>Share to Telegram</GlassButton>
        <GlassButton variant="neutral" className="w-full" onClick={() => void copyLink()}>Copy invite link</GlassButton>
        {feedback && <p className="text-sm text-neutralt-500 dark:text-neutralt-400 text-center font-semibold">{feedback}</p>}
      </div>
    </Modal>
  );
}

function RoomSettingsModal({
  open,
  onClose,
  room,
  memberCount,
  onUpdated,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  room: RoomRow | null;
  memberCount: number;
  onUpdated: (room: RoomRow) => void;
  onDeleted: (roomId: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subject, setSubject] = useState('Study');
  const [memberLimit, setMemberLimit] = useState(10);
  const [isPrivate, setIsPrivate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open || !room) return;
    setName(room.name);
    setDescription(room.description || '');
    setSubject(room.subject || 'Study');
    setMemberLimit(Math.min(10, room.member_limit || 10));
    setIsPrivate(room.is_private);
    setErrorMsg('');
    setConfirmDelete(false);
  }, [open, room]);

  if (!room) return null;

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setErrorMsg('');
    const safeLimit = Math.min(10, Math.max(Math.max(2, memberCount), Math.floor(memberLimit || 10)));
    const { data, error } = await supabase
      .from('rooms')
      .update({
        name: name.trim(),
        description: description.trim(),
        subject: subject.trim() || 'Study',
        is_private: isPrivate,
        member_limit: safeLimit,
      })
      .eq('id', room.id)
      .select()
      .single();
    if (error || !data) {
      setErrorMsg('Room settings saqlanmadi.');
      setSaving(false);
      return;
    }
    onUpdated(data as RoomRow);
    setSaving(false);
    onClose();
  };

  const deleteRoom = async () => {
    if (deleting) return;
    setDeleting(true);
    setErrorMsg('');
    try {
      while (true) {
        const { data: objects, error: listError } = await supabase.storage.from('room-files').list(room.id, { limit: 100, offset: 0 });
        if (listError || !objects || objects.length === 0) break;
        const paths = objects.map((object) => `${room.id}/${object.name}`);
        const { error: removeError } = await supabase.storage.from('room-files').remove(paths);
        if (removeError || objects.length < 100) break;
      }

      const { error } = await supabase.from('rooms').delete().eq('id', room.id);
      if (error) {
        setErrorMsg('Room o‘chirilmadi.');
        return;
      }
      await onDeleted(room.id);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Room settings">
      <div className="space-y-4">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Room name"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        <input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
          maxLength={60}
          placeholder="Subject"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={240}
          rows={3}
          placeholder="Room description"
          className="w-full glass-subtle rounded-2xl px-4 py-3 font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent resize-none"
        />
        <label className="glass-subtle rounded-2xl px-4 py-3 block">
          <span className="text-xs text-neutralt-500 dark:text-neutralt-400 block mb-1">Member limit · currently {memberCount}</span>
          <input
            type="number"
            min={Math.max(2, memberCount)}
            max={10}
            value={memberLimit}
            onChange={(event) => setMemberLimit(Math.min(10, Math.max(Math.max(2, memberCount), Number(event.target.value) || Math.max(2, memberCount))))}
            className="w-full bg-transparent font-bold outline-none"
          />
        </label>
        <button onClick={() => setIsPrivate(!isPrivate)} className="w-full flex items-center justify-between glass-subtle rounded-2xl px-4 py-3 glass-press">
          <span className="flex items-center gap-2 text-sm font-medium"><Lock size={16} className="text-neutralt-500" /> Private room</span>
          <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${isPrivate ? 'bg-accent' : 'bg-neutralt-400/40'}`}>
            <span className={`block w-5 h-5 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-4' : ''}`} />
          </span>
        </button>

        {errorMsg && <p className="text-sm text-red-500 text-center font-semibold">{errorMsg}</p>}
        <GlassButton className="w-full" onClick={() => void save()} disabled={!name.trim() || saving}>{saving ? 'Saving…' : 'Save settings'}</GlassButton>

        <div className="pt-3 border-t border-neutralt-400/20">
          {!confirmDelete ? (
            <GlassButton variant="danger" className="w-full" icon={Trash2} onClick={() => setConfirmDelete(true)}>Delete room</GlassButton>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-red-500 text-center font-semibold">Room, chat va fayl yozuvlari o‘chiriladi. Davom etasizmi?</p>
              <div className="flex gap-2">
                <GlassButton variant="danger" className="flex-1" onClick={() => void deleteRoom()} disabled={deleting}>{deleting ? 'Deleting…' : 'Yes, delete'}</GlassButton>
                <GlassButton variant="neutral" className="flex-1" onClick={() => setConfirmDelete(false)}>Cancel</GlassButton>
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function MemberManageModal({
  member,
  onClose,
  onRoleChange,
  onRemove,
}: {
  member: RoomMemberRow | null;
  onClose: () => void;
  onRoleChange: (member: RoomMemberRow, role: 'admin' | 'member') => Promise<boolean>;
  onRemove: (member: RoomMemberRow) => Promise<boolean>;
}) {
  const [working, setWorking] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    setWorking(false);
    setConfirmRemove(false);
  }, [member]);

  if (!member) return null;

  const changeRole = async (role: 'admin' | 'member') => {
    setWorking(true);
    const ok = await onRoleChange(member, role);
    setWorking(false);
    if (ok) onClose();
  };

  const remove = async () => {
    setWorking(true);
    const ok = await onRemove(member);
    setWorking(false);
    if (ok) onClose();
  };

  return (
    <Modal open={Boolean(member)} onClose={onClose} title="Manage member">
      <div className="space-y-4">
        <div className="glass-subtle rounded-2xl p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-accent/15 flex items-center justify-center text-lg">{member.user_avatar || '🦉'}</div>
          <div>
            <p className="font-semibold">{member.user_name}</p>
            <p className="text-xs text-neutralt-500 dark:text-neutralt-400">Current role: {member.role}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <GlassButton variant={member.role === 'admin' ? 'primary' : 'neutral'} icon={Shield} onClick={() => void changeRole('admin')} disabled={working}>Admin</GlassButton>
          <GlassButton variant={member.role === 'member' ? 'primary' : 'neutral'} icon={Users} onClick={() => void changeRole('member')} disabled={working}>Member</GlassButton>
        </div>

        {!confirmRemove ? (
          <GlassButton variant="danger" className="w-full" icon={UserMinus} onClick={() => setConfirmRemove(true)}>Remove from room</GlassButton>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-red-500 text-center font-semibold">Bu foydalanuvchini roomdan olib tashlaysizmi?</p>
            <div className="flex gap-2">
              <GlassButton variant="danger" className="flex-1" onClick={() => void remove()} disabled={working}>Remove</GlassButton>
              <GlassButton variant="neutral" className="flex-1" onClick={() => setConfirmRemove(false)}>Cancel</GlassButton>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RoomChat({
  roomId,
  userId,
  userName,
  userAvatar,
  onRead,
}: {
  roomId: string;
  userId: string;
  userName: string;
  userAvatar: string;
  onRead: (roomId: string) => void;
}) {
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
    void (async () => {
      const { data, error } = await supabase.from('room_messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true }).limit(200);
      if (!active) return;
      if (error) {
        console.error('Could not load room messages', error.message);
        setErrorMsg('Chat yuklanmadi.');
        setMessages([]);
      } else {
        setMessages((data ?? []) as RoomMessageRow[]);
        onRead(roomId);
      }
      setLoading(false);
    })();

    const channel = supabase
      .channel(`room_messages_${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        const incoming = payload.new as RoomMessageRow;
        setMessages((current) => current.some((message) => message.id === incoming.id) ? current : [...current, incoming]);
        onRead(roomId);
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [onRead, roomId]);

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
    setMessages((current) => current.some((message) => message.id === data.id) ? current : [...current, data as RoomMessageRow]);
    onRead(roomId);
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
          messages.map((message) => {
            const mine = message.user_id === userId;
            return (
              <div key={message.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                <div className="w-8 h-8 rounded-xl bg-accent/15 flex items-center justify-center text-base shrink-0">{message.user_avatar || '🦉'}</div>
                <div className={`max-w-[75%] ${mine ? 'items-end' : ''} flex flex-col`}>
                  {!mine && <span className="text-[10px] text-neutralt-500 mb-0.5 px-1">{message.user_name}</span>}
                  <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? 'bg-accent text-white' : 'glass-subtle'}`}>{message.body}</div>
                  <span className="text-[9px] text-neutralt-400 mt-0.5 px-1">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => event.key === 'Enter' && void send()}
          placeholder="Type a message…"
          className="flex-1 glass-subtle rounded-2xl px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 ring-accent/40 bg-transparent"
        />
        <button onClick={() => void send()} disabled={!body.trim() || sending} className="w-10 h-10 rounded-2xl bg-accent text-white flex items-center justify-center glass-press disabled:opacity-40">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function RoomFiles({ roomId, userId, userName, userAvatar }: { roomId: string; userId: string; userName: string; userAvatar: string }) {
  const [files, setFiles] = useState<RoomFileRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let active = true;
    const withSignedUrl = async (file: RoomFileRow): Promise<RoomFileRow> => {
      if (/^https?:\/\//i.test(file.file_url)) return file;
      const { data } = await supabase.storage.from('room-files').createSignedUrl(file.file_url, 60 * 60);
      return data?.signedUrl ? { ...file, file_url: data.signedUrl } : file;
    };

    void (async () => {
      const { data, error } = await supabase.from('room_files').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(100);
      if (!active) return;
      if (error) {
        setErrorMsg('Files yuklanmadi.');
        return;
      }
      const signedFiles = await Promise.all(((data ?? []) as RoomFileRow[]).map(withSignedUrl));
      if (active) setFiles(signedFiles);
    })();

    const channel = supabase
      .channel(`room_files_${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_files', filter: `room_id=eq.${roomId}` }, (payload) => {
        void withSignedUrl(payload.new as RoomFileRow).then((incoming) => {
          if (active) setFiles((current) => current.some((file) => file.id === incoming.id) ? current : [incoming, ...current]);
        });
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [roomId]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!isSupabaseConfigured) return;
    const file = event.target.files?.[0];
    if (!file || uploading) return;
    setUploading(true);
    setErrorMsg('');
    try {
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from('room-files').upload(path, file, { upsert: false });
      if (uploadError) {
        setErrorMsg(uploadError.message.includes('maximum') ? 'File juda katta. Maximum 15 MB.' : 'File upload bo‘lmadi.');
        return;
      }

      const { error: rowError } = await supabase.from('room_files').insert({
        room_id: roomId,
        user_id: userId,
        user_name: userName,
        user_avatar: userAvatar,
        file_name: file.name,
        file_url: path,
        file_type: file.type.startsWith('image/') ? 'image' : 'file',
        file_size: file.size,
      });
      if (rowError) {
        await supabase.storage.from('room-files').remove([path]);
        setErrorMsg('File ma’lumoti saqlanmadi.');
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <input ref={inputRef} type="file" onChange={(event) => void handleUpload(event)} className="hidden" />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="w-full glass-subtle rounded-2xl py-3 flex items-center justify-center gap-2 text-sm font-semibold glass-press disabled:opacity-50"
      >
        <Paperclip size={16} />
        {uploading ? 'Uploading…' : 'Upload file'}
      </button>
      {errorMsg && <p className="text-xs text-red-500 text-center font-semibold">{errorMsg}</p>}
      {files.length === 0 ? (
        <p className="text-sm text-neutralt-500 text-center py-6">No files shared yet.</p>
      ) : (
        <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-hide">
          {files.map((file) => (
            <a key={file.id} href={file.file_url} target="_blank" rel="noreferrer" className="flex items-center gap-3 glass-subtle rounded-2xl p-3 glass-press">
              <div className="w-9 h-9 rounded-xl bg-accent/15 text-accent-500 flex items-center justify-center">
                {file.file_type === 'image' ? <ImageIcon size={16} /> : <FileText size={16} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{file.file_name}</p>
                <p className="text-xs text-neutralt-500 dark:text-neutralt-400">
                  {file.user_name} · {file.file_size > 0 ? `${(file.file_size / 1024).toFixed(1)} KB` : ''}
                </p>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
