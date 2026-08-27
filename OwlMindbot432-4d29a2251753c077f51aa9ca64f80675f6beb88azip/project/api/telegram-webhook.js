const TELEGRAM_API = 'https://api.telegram.org';

function getBaseWebAppUrl() {
  const explicit = process.env.TELEGRAM_WEBAPP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (productionHost) return `https://${productionHost.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;

  return null;
}

function parseStartParam(text = '') {
  const match = text.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  return match?.[1]?.trim() || null;
}

function buildWebAppUrl(baseUrl, startParam) {
  const url = new URL(baseUrl);

  // Room deep links can arrive as /start room_CODE.
  // The Mini App already understands ?join=CODE.
  if (startParam?.startsWith('room_')) {
    const roomCode = startParam.slice('room_'.length).trim();
    if (roomCode) url.searchParams.set('join', roomCode);
  }

  if (startParam?.startsWith('race_')) {
    const raceCode = startParam.slice('race_'.length).trim();
    if (raceCode) url.searchParams.set('race', raceCode);
  }

  return url.toString();
}

function copyFor(languageCode = 'en', isRoomInvite = false, isRaceInvite = false) {
  const lang = languageCode.toLowerCase();

  if (lang.startsWith('uz')) {
    return {
      text:
        '<b>🦉 OwlMind — o‘qish va fokusni boshqarish uchun aqlli yordamchi.</b>\n\n' +
        'OwlMind bilan siz:\n' +
        '⏱ Pomodoro, Stopwatch va Deep Focus orqali diqqatingizni jamlaysiz\n' +
        '✅ vazifalarni rejalashtirasiz\n' +
        '📅 haftalik o‘qish jadvalini tuzasiz\n' +
        '👥 Study Rooms’da do‘stlaringiz bilan birga o‘qiysiz\n' +
        '🏆 streak, reyting va o‘qish natijalaringizni kuzatasiz\n\n' +
        (isRoomInvite
          ? 'Siz Study Room taklifi orqali keldingiz. Xonani ochish uchun tugmani bosing 👇'
          : isRaceInvite
            ? 'Siz Friends Race taklifi orqali keldingiz. Haftalik poygaga qo‘shilish uchun tugmani bosing 👇'
            : 'Boshlash uchun quyidagi tugmani bosing 👇'),
      button: isRoomInvite ? '👥 Room’ni ochish' : isRaceInvite ? '🏁 Race’ga qo‘shilish' : '🦉 OwlMind’ni ochish',
    };
  }

  if (lang.startsWith('ru')) {
    return {
      text:
        '<b>🦉 OwlMind — умный помощник для учёбы и концентрации.</b>\n\n' +
        'С OwlMind вы можете:\n' +
        '⏱ заниматься в режимах Pomodoro, Stopwatch и Deep Focus\n' +
        '✅ планировать задачи\n' +
        '📅 составлять недельное расписание учёбы\n' +
        '👥 заниматься вместе с друзьями в Study Rooms\n' +
        '🏆 отслеживать streak, рейтинг и результаты учёбы\n\n' +
        (isRoomInvite
          ? 'Вы перешли по приглашению в Study Room. Нажмите кнопку ниже, чтобы открыть комнату 👇'
          : isRaceInvite
            ? 'Вы перешли по приглашению в Friends Race. Нажмите ниже, чтобы присоединиться к недельной гонке 👇'
            : 'Нажмите кнопку ниже, чтобы открыть приложение 👇'),
      button: isRoomInvite ? '👥 Открыть комнату' : isRaceInvite ? '🏁 Присоединиться к гонке' : '🦉 Открыть OwlMind',
    };
  }

  return {
    text:
      '<b>🦉 OwlMind — a smart companion for studying and staying focused.</b>\n\n' +
      'With OwlMind you can:\n' +
      '⏱ focus with Pomodoro, Stopwatch and Deep Focus\n' +
      '✅ plan your tasks\n' +
      '📅 organize your weekly study schedule\n' +
      '👥 study together with friends in Study Rooms\n' +
      '🏆 track your streak, rankings and study progress\n\n' +
      (isRoomInvite
        ? 'You came through a Study Room invite. Tap below to open the room 👇'
        : isRaceInvite
          ? 'You came through a Friends Race invite. Tap below to join the weekly race 👇'
          : 'Tap the button below to open the app 👇'),
    button: isRoomInvite ? '👥 Open room' : isRaceInvite ? '🏁 Join race' : '🦉 Open OwlMind',
  };
}

async function sendTelegramMessage(botToken, payload) {
  const response = await fetch(`${TELEGRAM_API}/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'OwlMind Telegram webhook' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const configuredSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  if (configuredSecret) {
    const incomingSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (incomingSecret !== configuredSecret) {
      return res.status(401).json({ ok: false, error: 'Invalid webhook secret' });
    }
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const baseWebAppUrl = getBaseWebAppUrl();

  if (!botToken || !baseWebAppUrl) {
    console.error('Telegram webhook is missing TELEGRAM_BOT_TOKEN or TELEGRAM_WEBAPP_URL/VERCEL_PROJECT_PRODUCTION_URL');
    return res.status(500).json({ ok: false, error: 'Telegram webhook is not configured' });
  }

  const update = req.body || {};
  const message = update.message;
  const text = message?.text || '';
  const chatId = message?.chat?.id;

  if (!chatId) {
    return res.status(200).json({ ok: true });
  }

  const isStart = /^\/start(?:@\w+)?(?:\s|$)/i.test(text);
  const isHelp = /^\/help(?:@\w+)?(?:\s|$)/i.test(text);

  if (!isStart && !isHelp) {
    return res.status(200).json({ ok: true });
  }

  const startParam = isStart ? parseStartParam(text) : null;
  const isRoomInvite = Boolean(startParam?.startsWith('room_'));
  const isRaceInvite = Boolean(startParam?.startsWith('race_'));
  const webAppUrl = buildWebAppUrl(baseWebAppUrl, startParam);
  const copy = copyFor(message?.from?.language_code || 'en', isRoomInvite, isRaceInvite);

  try {
    await sendTelegramMessage(botToken, {
      chat_id: chatId,
      text: copy.text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: copy.button,
              web_app: { url: webAppUrl },
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(502).json({ ok: false, error: 'Failed to send Telegram message' });
  }

  return res.status(200).json({ ok: true });
}
