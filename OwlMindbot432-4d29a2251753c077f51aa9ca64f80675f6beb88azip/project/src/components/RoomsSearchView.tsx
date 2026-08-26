import { useEffect, useState } from 'react';
import { Crown, Lock, Search, Users, X } from 'lucide-react';
import { StudyRoomsView } from './StudyRoomsView';
import { GlassButton, GlassCard } from './ui';
import { store, useStore } from '../store';
import { isSupabaseConfigured, supabase, type RoomRow } from '../supabaseClient';
import { upsertTelegramUser } from '../lib/supabase';
import { getTelegramUserId, getTelegramUserName } from '../telegram';

type SearchResult = {
  room: RoomRow;
  memberCount: number;
  isMember: boolean;
  invited: boolean;
};

export function RoomsSearchView() {
  const profile = useStore((s) => s.profile);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [opening, setOpening] = useState(false);

  const userId = getTelegramUserId() ?? 'local-user';
  const userName = profile.name && profile.name !== 'You' ? profile.name : (getTelegramUserName() ?? 'You');
  const userAvatar = profile.avatar || '🦉';

  useEffect(() => {
    if (!isSupabaseConfigured || code.length !== 6) {
      setResult(null);
      setSearching(false);
      setErrorMsg('');
      return;
    }

    let active = true;
    const timer = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        setErrorMsg('');

        const { data: roomData, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('room_code', code)
          .maybeSingle();

        if (!active) return;
        if (roomError) {
          setSearching(false);
          setResult(null);
          setErrorMsg('Room qidirishda xatolik yuz berdi.');
          return;
        }
        if (!roomData) {
          setSearching(false);
          setResult(null);
          setErrorMsg('Bu kod bilan room topilmadi.');
          return;
        }

        const room = roomData as RoomRow;
        const [memberResponse, inviteResponse, countResponse] = await Promise.all([
          supabase
            .from('room_participants')
            .select('id')
            .eq('room_id', room.id)
            .eq('user_id', userId)
            .maybeSingle(),
          supabase
            .from('room_invites')
            .select('id')
            .eq('room_id', room.id)
            .eq('invitee_id', userId)
            .eq('status', 'pending')
            .maybeSingle(),
          supabase
            .from('room_participants')
            .select('id', { count: 'exact', head: true })
            .eq('room_id', room.id),
        ]);

        if (!active) return;
        setResult({
          room,
          memberCount: countResponse.count ?? 0,
          isMember: Boolean(memberResponse.data),
          invited: Boolean(inviteResponse.data),
        });
        setSearching(false);
      })();
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [code, userId]);

  const openRoom = async () => {
    if (!result || opening) return;
    setOpening(true);
    setErrorMsg('');

    const { room } = result;
    const now = new Date().toISOString();

    try {
      if (!result.isMember) {
        if (room.is_private && room.owner_id !== userId && !result.invited) {
          setErrorMsg('Bu private roomga kirish uchun invitation kerak.');
          return;
        }

        if (result.memberCount >= room.member_limit) {
          setErrorMsg('Bu room to‘lib bo‘lgan.');
          return;
        }

        const telegramUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (telegramUser) {
          const { error: syncError } = await upsertTelegramUser({
            id: userId,
            first_name: telegramUser.first_name || userName,
            username: telegramUser.username ?? null,
            photo_url: telegramUser.photo_url ?? null,
          });
          if (syncError) throw syncError;
        }

        const { error: joinError } = await supabase.from('room_participants').insert({
          room_id: room.id,
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

        if (joinError) {
          if (joinError.message.includes('Room is full')) {
            setErrorMsg('Bu room to‘lib bo‘lgan.');
            return;
          }
          throw joinError;
        }

        if (result.invited) {
          await supabase
            .from('room_invites')
            .update({ status: 'accepted', accepted_at: now })
            .eq('room_id', room.id)
            .eq('invitee_id', userId)
            .eq('status', 'pending');
        }

        setResult((current) => current ? {
          ...current,
          isMember: true,
          invited: false,
          memberCount: current.memberCount + 1,
        } : current);
      } else {
        const { error: openError } = await supabase
          .from('room_participants')
          .update({
            is_online: true,
            user_name: userName,
            user_avatar: userAvatar,
            last_opened_at: now,
          })
          .eq('room_id', room.id)
          .eq('user_id', userId);
        if (openError) throw openError;
      }

      store.joinRoom(room.id);
      setCode('');
      setResult(null);
    } catch (error) {
      console.error('Room code search open failed', error);
      setErrorMsg('Roomni ochib bo‘lmadi. Qayta urinib ko‘ring.');
    } finally {
      setOpening(false);
    }
  };

  const normalizedChange = (value: string) => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(normalized);
    setResult(null);
    setErrorMsg('');
  };

  const privateLocked = Boolean(result && result.room.is_private && result.room.owner_id !== userId && !result.isMember && !result.invited);
  const roomFull = Boolean(result && !result.isMember && result.memberCount >= result.room.member_limit);

  return (
    <div className="rooms-code-layout flex flex-col pb-4">
      <style>{`
        .rooms-code-layout > .rooms-original { display: contents; }
        .rooms-code-layout > .rooms-original > .space-y-5 { display: contents; }
        .rooms-code-layout > .rooms-original > .space-y-5 > header { order: 1; }
        .rooms-code-layout > .room-code-search { order: 2; margin-top: 1.25rem; }
        .rooms-code-layout > .rooms-original > .space-y-5 > :not(header) { order: 3; }

        .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .min-w-0 > p {
          font-family: inherit;
          font-size: 0.75rem;
          line-height: 1.15rem;
          margin-top: 0.22rem;
          letter-spacing: 0;
        }
        .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .min-w-0 > p:first-of-type {
          margin-top: 0.45rem;
          font-weight: 600;
        }
        .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .min-w-0 > p:nth-last-child(2),
        .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .min-w-0 > p:last-child {
          white-space: nowrap;
          font-weight: 500;
        }
        .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .min-w-0 > p:nth-last-child(2) > span {
          font-family: inherit;
          font-weight: 700;
          letter-spacing: 0.08em;
        }

        @media (max-width: 480px) {
          .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 {
            flex-wrap: wrap;
            row-gap: 0.75rem;
          }
          .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .min-w-0 {
            flex: 1 1 100%;
            width: 100%;
          }
          .rooms-code-layout > .rooms-original > .space-y-5 > .p-5.animate-scale-in > .flex.items-start.justify-between.mb-4.gap-3 > .flex.gap-2.shrink-0.flex-wrap.justify-end {
            flex: 1 1 100%;
            width: 100%;
            justify-content: flex-start;
          }
        }
      `}</style>

      <div className="rooms-original">
        <StudyRoomsView />
      </div>

      <div className="room-code-search px-1">
        <div className="relative">
          <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-neutralt-500 dark:text-neutralt-400 pointer-events-none" />
          <input
            value={code}
            onChange={(event) => normalizedChange(event.target.value)}
            inputMode="text"
            autoComplete="off"
            maxLength={6}
            placeholder="Search by room code"
            aria-label="Search room by code"
            className="w-full glass-subtle rounded-2xl pl-10 pr-11 py-3 text-sm font-bold tracking-wider uppercase outline-none focus:ring-2 ring-accent/40 bg-transparent"
          />
          {code && (
            <button
              type="button"
              onClick={() => normalizedChange('')}
              aria-label="Clear room search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl flex items-center justify-center text-neutralt-500 dark:text-neutralt-400 glass-press"
            >
              <X size={15} />
            </button>
          )}
        </div>

        {code.length > 0 && code.length < 6 && (
          <p className="text-[11px] text-neutralt-500 dark:text-neutralt-400 mt-1.5 px-1">6 xonali room code kiriting.</p>
        )}
        {searching && <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-2 px-1">Searching…</p>}
        {errorMsg && <p className="text-xs text-red-500 font-semibold mt-2 px-1">{errorMsg}</p>}

        {result && (
          <GlassCard className="p-3 mt-2 animate-scale-in">
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-display font-bold truncate">{privateLocked ? 'Private room' : result.room.name}</p>
                  {result.room.is_private && <Lock size={13} className="text-neutralt-400" />}
                </div>
                <p className="text-xs text-neutralt-500 dark:text-neutralt-400 mt-1 flex items-center gap-1 flex-wrap">
                  <Crown size={11} /> {result.room.owner_name}
                  <span>·</span>
                  <Users size={11} /> {result.memberCount}/{result.room.member_limit}
                  <span>·</span>
                  <span className="font-bold tracking-wider">{result.room.room_code}</span>
                </p>
              </div>
              <GlassButton
                size="sm"
                onClick={() => void openRoom()}
                disabled={opening || roomFull || privateLocked}
              >
                {opening ? 'Opening…' : result.isMember ? 'Open' : privateLocked ? 'Locked' : roomFull ? 'Full' : 'Join'}
              </GlassButton>
            </div>
          </GlassCard>
        )}
      </div>
    </div>
  );
}
