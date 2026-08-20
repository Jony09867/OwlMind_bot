// Telegram WebApp utilities
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
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

export function getTelegramUserId(): string | null {
  try {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    return u ? String(u.id) : null;
  } catch {
    return null;
  }
}

export function getTelegramUserName(): string | null {
  try {
    const u = window.Telegram?.WebApp?.initDataUnsafe?.user;
    if (!u) return null;
    return u.first_name || u.username || null;
  } catch {
    return null;
  }
}

export function getTelegramUser(): { id: string; first_name: string; username: string | null; photo_url: string | null } | null {
  try {
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

export function initTelegram(): void {
  try {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
  } catch {}
}

export function hapticImpact(style: 'light' | 'medium' | 'heavy' = 'light'): void {
  try {
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred(style);
  } catch {}
}

export {};
