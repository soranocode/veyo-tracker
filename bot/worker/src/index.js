// veyo-reminders — доставка напоминаний Veyo Tracker (Cloudflare Worker)
// Эндпоинты:
//   POST /api/sync   — мини-апп: { user_id, tz, tasks: [{id,name,emoji,reminderTime,active}] }
//   POST /webhook    — Telegram updates (сохраняем chat_id пользователя)
//   cron (каждую минуту) — отправка напоминаний через Telegram Bot API
// KV:
//   user:<tg_user_id>            -> { tz, tasks, updatedAt }
//   chat:<tg_user_id>            -> chat_id
//   sent:<tg_user_id>:<date>:<taskId> -> '1' (TTL 24ч, защита от дублей)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extraHeaders },
  });
}

// Время HH:MM в таймзоне пользователя
function timeInTz(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    // невалидная tz -> UTC
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }
}

function dateInTz(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
}

// ---- POST /api/sync ----
async function handleSync(request, env) {
  try {
    const body = await request.json();
    const userId = body && body.user_id;
    if (!userId) return json({ ok: false, error: 'missing user_id' }, 400);

    await env.VEYO_KV.put(
      `user:${userId}`,
      JSON.stringify({
        tz: (typeof body.tz === 'string' && body.tz) || 'UTC',
        tasks: Array.isArray(body.tasks) ? body.tasks : [],
        updatedAt: new Date().toISOString(),
      })
    );
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

// ---- POST /webhook (Telegram) ----
async function handleWebhook(request, env) {
  try {
    const update = await request.json();
    const msg = update && (update.message || update.channel_post);
    const from = msg && (msg.from || msg.sender_chat);
    const chat = msg && msg.chat;
    if (from && from.id && chat && chat.id) {
      // chat_id привязан к telegram user_id (бот шлёт напоминания в этот чат)
      await env.VEYO_KV.put(`chat:${from.id}`, String(chat.id));
    }
    // Бот в режиме «только плашка»: на сообщения не отвечаем
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

// ---- Отправка одного сообщения ----
async function sendTelegram(env, chatId, text) {
  const resp = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Telegram ${resp.status}: ${body.slice(0, 300)}`);
  }
}

// ---- Cron: доставка напоминаний ----
async function deliverReminders(env) {
  if (!env.BOT_TOKEN) {
    console.error('BOT_TOKEN не задан');
    return;
  }
  const list = await env.VEYO_KV.list({ prefix: 'user:' });
  for (const key of list.keys) {
    const userId = key.name.slice('user:'.length);
    const raw = await env.VEYO_KV.get(key.name);
    if (!raw) continue;

    let data;
    try { data = JSON.parse(raw); } catch { continue; }
    if (!data.tz || !Array.isArray(data.tasks) || data.tasks.length === 0) continue;

    const chatId = await env.VEYO_KV.get(`chat:${userId}`);
    if (!chatId) continue; // пользователь ещё не открывал чат с ботом

    const now = new Date();
    const hhmm = timeInTz(data.tz, now);
    const day = dateInTz(data.tz, now);

    for (const task of data.tasks) {
      if (!task || !task.active || !task.reminderTime) continue;
      if (task.reminderTime !== hhmm) continue;

      // защита от дублей: одно напоминание на задачу в день
      const sentKey = `sent:${userId}:${day}:${task.id}`;
      const already = await env.VEYO_KV.get(sentKey);
      if (already) continue;

      try {
        await sendTelegram(env, chatId, `Напоминание ${task.emoji || '🔔'} ${task.name}`);
        await env.VEYO_KV.put(sentKey, '1', { expirationTtl: 86400 });
      } catch (err) {
        console.error(`send fail user=${userId} task=${task.id}:`, String(err));
      }
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }
    if (url.pathname === '/api/sync' && request.method === 'POST') {
      return handleSync(request, env);
    }
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (url.pathname === '/') {
      return json({ ok: true, service: 'veyo-reminders' });
    }
    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(deliverReminders(env));
  },
};
