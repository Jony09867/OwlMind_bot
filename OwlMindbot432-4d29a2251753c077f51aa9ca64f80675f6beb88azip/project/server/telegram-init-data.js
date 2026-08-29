import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_MAX_AGE_SEC = 10 * 60;

function safeEqualHex(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  return timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}
export function validateTelegramInitData(initData, botToken, options = {}) {
  if (typeof initData !== 'string' || initData.length === 0 || initData.length > 8192) {
    throw new Error('Invalid Telegram initData');
  }
  if (typeof botToken !== 'string' || botToken.trim() === '') {
    throw new Error('Telegram bot token is not configured');
  }

  const params = new URLSearchParams(initData);
  const receivedHash = params.get('hash') ?? '';
  params.delete('hash');
  params.delete('signature');

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expectedHash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  if (!safeEqualHex(receivedHash, expectedHash)) {
    throw new Error('Telegram initData signature is invalid');
  }

  const nowSec = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const authDate = Number(params.get('auth_date'));
  const maxAgeSec = Math.max(60, Number(options.maxAgeSec) || DEFAULT_MAX_AGE_SEC);
  if (!Number.isInteger(authDate) || authDate > nowSec + 30 || nowSec - authDate > maxAgeSec) {
    throw new Error('Telegram initData has expired');
  }

  let user;
  try {
    user = JSON.parse(params.get('user') ?? 'null');
  } catch {
    throw new Error('Telegram user data is invalid');
  }

  if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) {
    throw new Error('Telegram user is missing');
  }

  return {
    id: String(user.id),
    first_name: typeof user.first_name === 'string' && user.first_name.trim()
      ? user.first_name.trim().slice(0, 128)
      : 'Telegram User',
    username: typeof user.username === 'string' && user.username.trim()
      ? user.username.trim().slice(0, 64)
      : null,
    photo_url: typeof user.photo_url === 'string' && user.photo_url.startsWith('https://')
      ? user.photo_url.slice(0, 2048)
      : null,
  };
}
