import { createClient } from '@supabase/supabase-js';
import { validateTelegramInitData } from '../server/telegram-init-data.js';

function getBody(req) {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body ?? {};
}

function syntheticEmail(telegramId) {
  return `telegram-${telegramId}@auth.owlmind.app`;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!botToken || !supabaseUrl || !serviceRoleKey) {
    console.error('Telegram auth is missing required server environment variables');
    return res.status(503).json({ ok: false, error: 'Authentication is not configured' });
  }

  let telegramUser;
  try {
    const maxAgeSec = Number(process.env.TELEGRAM_INIT_DATA_MAX_AGE_SEC) || undefined;
    telegramUser = validateTelegramInitData(getBody(req).initData, botToken, { maxAgeSec });
  } catch (error) {
    return res.status(401).json({
      ok: false,
      error: error instanceof Error ? error.message : 'Telegram authentication failed',
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = syntheticEmail(telegramUser.id);

  try {
    const { data: profile } = await admin
      .from('users')
      .select('auth_user_id')
      .eq('id', telegramUser.id)
      .maybeSingle();

    let authUserId = profile?.auth_user_id ?? null;
    let authUser = null;
    let sessionLink = null;
    if (authUserId) {
      const { data } = await admin.auth.admin.getUserById(authUserId);
      authUser = data.user;
    }

    if (!authUser) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { provider: 'telegram', telegram_user_id: telegramUser.id },
        user_metadata: {
          first_name: telegramUser.first_name,
          username: telegramUser.username,
          photo_url: telegramUser.photo_url,
        },
      });
      if (error || !data.user) {
        const { data: existingLink, error: existingLinkError } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
        });
        if (existingLinkError || !existingLink.user) {
          throw error ?? existingLinkError ?? new Error('Could not create Supabase user');
        }
        authUser = existingLink.user;
        authUserId = existingLink.user.id;
        sessionLink = existingLink;
      } else {
        authUser = data.user;
        authUserId = data.user.id;
      }
    } else {
      const { error } = await admin.auth.admin.updateUserById(authUser.id, {
        email,
        email_confirm: true,
        app_metadata: { provider: 'telegram', telegram_user_id: telegramUser.id },
        user_metadata: {
          first_name: telegramUser.first_name,
          username: telegramUser.username,
          photo_url: telegramUser.photo_url,
        },
      });
      if (error) throw error;
    }

    const { error: profileError } = await admin.from('users').upsert({
      id: telegramUser.id,
      auth_user_id: authUserId,
      first_name: telegramUser.first_name,
      username: telegramUser.username,
      photo_url: telegramUser.photo_url,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (profileError) throw profileError;

    let linkError = null;
    if (!sessionLink) {
      const result = await admin.auth.admin.generateLink({ type: 'magiclink', email });
      sessionLink = result.data;
      linkError = result.error;
    }
    if (linkError || !sessionLink?.properties?.hashed_token) {
      throw linkError ?? new Error('Could not create Supabase session token');
    }

    return res.status(200).json({
      ok: true,
      tokenHash: sessionLink.properties.hashed_token,
      user: telegramUser,
    });
  } catch (error) {
    console.error('Telegram auth exchange failed', error);
    return res.status(500).json({ ok: false, error: 'Could not create an authenticated session' });
  }
}
