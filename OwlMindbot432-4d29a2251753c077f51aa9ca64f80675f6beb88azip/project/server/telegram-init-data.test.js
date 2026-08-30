import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { validateTelegramInitData } from './telegram-init-data.js';

const botToken = '123456:test-token';
const nowMs = Date.parse('2026-08-29T10:00:00Z');

function signedInitData(overrides = {}) {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(nowMs / 1000)),
    query_id: 'test-query',
    signature: 'telegram-third-party-signature',
    user: JSON.stringify({ id: 123456789, first_name: 'Ali', username: 'ali' }),
    ...overrides,
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));
  return params.toString();
}

test('accepts authentic and fresh Telegram initData', () => {
  assert.deepEqual(validateTelegramInitData(signedInitData(), botToken, { nowMs }), {
    id: '123456789',
    first_name: 'Ali',
    username: 'ali',
    photo_url: null,
  });
});

test('accepts authentic legacy initData without a third-party signature', () => {
  const initData = signedInitData();
  const params = new URLSearchParams(initData);
  params.delete('hash');
  params.delete('signature');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secretKey).update(dataCheckString).digest('hex'));

  assert.equal(validateTelegramInitData(params.toString(), botToken, { nowMs }).id, '123456789');
});

test('rejects a modified Telegram third-party signature field', () => {
  const params = new URLSearchParams(signedInitData());
  params.set('signature', 'modified-signature');
  assert.throws(() => validateTelegramInitData(params.toString(), botToken, { nowMs }), /signature/i);
});

test('rejects a modified Telegram payload', () => {
  const modified = signedInitData().replace('123456789', '987654321');
  assert.throws(() => validateTelegramInitData(modified, botToken, { nowMs }), /signature/i);
});

test('rejects expired Telegram initData', () => {
  const stale = signedInitData({ auth_date: String(Math.floor(nowMs / 1000) - 3600) });
  assert.throws(() => validateTelegramInitData(stale, botToken, { nowMs }), /expired/i);
});
