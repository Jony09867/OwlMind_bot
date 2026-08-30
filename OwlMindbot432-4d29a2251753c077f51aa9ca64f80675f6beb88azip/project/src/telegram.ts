import { isSupabaseAvailable, setSupabaseAuthenticated, supabase } from './lib/supabase';

// Telegram WebApp utilities
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          start_param?: string;
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        openTelegramLink?: (url: string) => void;
        openLink?: (url: string) => void;
        themeParams: Record<string, string>;
        colorScheme: 'light' | 'dark';
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
        };
        BackButton: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: string) => void;
          notificationOccurred: (type: string) => void;
        };
      };
    };
  }
}

export type VerifiedTelegramUser = {
  id: string;
  first_name: string;
  username: string | null;
  photo_url: string | null;
};

let verifiedTelegramUser: VerifiedTelegramUser | null = null;

export async function authenticateTelegram(): Promise<boolean> {
  if (!isSupabaseAvailable) return false;
  const initData = window.Telegram?.WebApp?.initData;
  if (!initData) {
    setSupabaseAuthenticated(false);
    return false;
  }

  try {
    const response = await fetch('/api/telegram-auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData }),
      credentials: 'same-origin',
    });
    const payload = await response.json() as {
      ok?: boolean;
      tokenHash?: string;
      user?: VerifiedTelegramUser;
      error?: string;
    };
    if (!response.ok || !payload.ok || !payload.tokenHash || !payload.user) {
      throw new Error(payload.error || 'Telegram authentication failed');
    }

    const { data, error } = await supabase.auth.verifyOtp({
      token_hash: payload.tokenHash,
      type: 'email',
    });
    if (error || !data.session) throw error ?? new Error('Supabase session was not created');

    const telegramId = data.session.user.app_metadata?.telegram_user_id;
    if (String(telegramId ?? '') !== payload.user.id) {
      await supabase.auth.signOut();
      throw new Error('Authenticated Telegram identity does not match');
    }

    verifiedTelegramUser = payload.user;
    setSupabaseAuthenticated(true);
    return true;
  } catch (error) {
    console.error('Telegram authentication failed', error);
    verifiedTelegramUser = null;
    setSupabaseAuthenticated(false);
    return false;
  }
}

export function getTelegramUserId(): string | null {
  try {
    if (verifiedTelegramUser) return verifiedTelegramUser.id;
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return u ? String(u.id) : null;
  } catch {
    return null;
  }
}

export function getTelegramUserName(): string | null {
  try {
    if (verifiedTelegramUser) return verifiedTelegramUser.first_name || verifiedTelegramUser.username;
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!u) return null;
    return u.first_name || u.username || null;
  } catch {
    return null;
  }
}

export function getTelegramUser(): VerifiedTelegramUser | null {
  try {
    if (verifiedTelegramUser) return verifiedTelegramUser;
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!u) return null;
    return {
      id: String(u.id),
      first_name: u.first_name || u.username || 'Telegram User',
      username: u.username ?? null,
      photo_url: u.photo_url ?? null,
    };
  } catch {
    return null;
  }
}

export function getTelegramStartParam(): string | null {
  try {
    return window.Telegram?.WebApp?.initDataUnsafe?.start_param ?? null;
  } catch {
    return null;
  }
}

export function initTelegram(): void {
  try {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  } catch {
    // Telegram SDK is optional outside the Mini App client.
  }
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {
    // Haptics are best-effort on unsupported Telegram clients.
  }
}

export function openTelegramLink(url: string): void {
  try {
    if (window.Telegram?.WebApp?.openTelegramLink) {
      window.Telegram.WebApp.openTelegramLink(url);
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

export {};

