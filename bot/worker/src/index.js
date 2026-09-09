// veyo-reminders — доставка напоминаний Veyo Tracker (Cloudflare Worker)
// v2 (2026-09-03): два события на задачу:
//   1) Предупреждение за leadMin минут до времени задачи (текст, без кнопок)
//   2) Уведомление ровно в время задачи (текст + кнопка «Выполнено»)
// Формат сообщения: {эмодзи|цветной кружок} {название} — {время задачи}
// v3 (2026-09-09): серверная синхронизация данных мини-аппа (вариант B) — /api/data + валидация initData.
// Эндпоинты:
//   POST /api/sync    — мини-апп: { user_id, tz, leadMin, tasks: [{id,name,emoji,color,reminderTime,active,goal,doneToday}] }
//   GET  /api/state   — мини-апп: ?user_id= -> отметки «выполнено» из бота { done: { <taskId>: ["YYYY-MM-DD", ...] } }
//   GET  /api/data    — мини-апп: ?initData=<сырой tg.initData> -> { ok, updatedAt:<ms|null>, data:<строка|null> } (снимок состояния)
//   POST /api/data    — мини-апп: { initData, updatedAt:<ms>, data:"<json строкой>" } — last-write-wins (updatedAt > snap.updatedAt)
//   POST /webhook     — Telegram updates: сообщения (копируем chat_id) + callback_query (кнопка «Выполнено»)
//   cron (каждую минуту) — доставка
// KV:
//   user:<tg_user_id>                 -> { tz, leadMin, tasks:[...], updatedAt }
//   chat:<tg_user_id>                 -> chat_id
//   done:<tg_user_id>:<date>:<taskId> -> '1' (выполнено из бота; TTL 7 дней — /api/state отдаёт эти дни)
//   sent:<tg_user_id>:<date>:<taskId>:<warn|due> -> '1' (защита от дублей; TTL 2 дня)
//   warnmsg:<tg_user_id>:<taskId> -> message_id предупреждения (удаляем при уведомлении; TTL 3 дня)
//   snap:<tg_user_id>                 -> { updatedAt:<ms>, data:"<полный JSON состояния приложения строкой>" } (зеркало для синка; без TTL)
// TODO (безопасность, обратная совместимость): /api/sync и /api/state пока принимают user_id без проверки —
//   добавить валидацию initData по аналогии с /api/data, когда мини-апп начнёт слать initData (v9+).

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const LEAD_OPTIONS = [0, 15, 30, 60];
const DEFAULT_LEAD_MIN = 30;
const DONE_TTL_SEC = 7 * 86400;   // окно, которое отдаёт /api/state
const SENT_TTL_SEC = 2 * 86400;
const WARNMSG_TTL_SEC = 3 * 86400; // message_id предупреждения, чтобы удалить его при уведомлении

// ---- цвет задачи -> кружок-эмодзи (в Telegram текст не покрасить) ----
const CIRCLE_BY_HEX = {
  '#22a2f0': '🔵', // синий (дефолт приложения)
  '#00b894': '🟢', // зелёный
  '#fdcb6e': '🟡', // жёлтый
  '#e17055': '🟠', // оранжевый
  '#6c5ce7': '🟣', // фиолетовый
  '#d63031': '🔴', // красный
  '#e84393': '🔴', // розовый (розового круга нет — ближайший красный)
  '#000000': '⚫',
};

const FALLBACK_CIRCLES = [
  ['⚫', [0, 0, 0]],
  ['⚪', [255, 255, 255]],
  ['🔴', [229, 57, 53]],
  ['🟠', [225, 112, 85]],
  ['🟡', [253, 203, 110]],
  ['🟢', [0, 184, 148]],
  ['🔵', [34, 162, 240]],
  ['🟣', [108, 92, 231]],
  ['🟤', [141, 110, 99]],
];

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function circleForColor(color) {
  const key = String(color || '').toLowerCase();
  if (CIRCLE_BY_HEX[key]) return CIRCLE_BY_HEX[key];
  const rgb = hexToRgb(key);
  if (!rgb) return '🔵';
  let best = FALLBACK_CIRCLES[0][0];
  let bestD = Infinity;
  for (const [emoji, ref] of FALLBACK_CIRCLES) {
    const d = (rgb[0] - ref[0]) ** 2 + (rgb[1] - ref[1]) ** 2 + (rgb[2] - ref[2]) ** 2;
    if (d < bestD) { bestD = d; best = emoji; }
  }
  return best;
}

// иконка задачи: эмодзи, если выбран; иначе цветной кружок
function taskIcon(task) {
  const emoji = task && task.emoji ? String(task.emoji).trim() : '';
  if (emoji && emoji !== '??') return emoji;
  return circleForColor(task && task.color);
}

function taskLine(task, withPrefix) {
  const time = task.reminderTime || '';
  const icon = taskIcon(task);
  const body = `${icon} ${task.name}${time ? ' — ' + time : ''}`;
  return withPrefix ? `Напоминание: ${body}` : body;
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...CORS, ...extraHeaders },
  });
}

// ---- время/дата в таймзоне пользователя ----
function normHhmm(s) {
  return String(s).replace(/^24:/, '00:'); // Intl может вернуть 24:xx вместо 00:xx
}

function timeInTz(tz, date = new Date()) {
  try {
    return normHhmm(new Intl.DateTimeFormat('en-GB', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date));
  } catch {
    return normHhmm(new Intl.DateTimeFormat('en-GB', {
      timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date));
  }
}

function dateInTz(tz, date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  }
}

function parseHhmm(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim());
  if (!m) return null;
  const h = parseInt(m[1], 10) % 24;
  const min = parseInt(m[2], 10);
  if (min > 59) return null;
  return h * 60 + min;
}

function minToHhmm(min) {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// ---- Telegram API ----
async function tgApi(env, method, payload) {
  const resp = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await resp.text();
  if (!resp.ok) throw new Error(`${method} ${resp.status}: ${body.slice(0, 300)}`);
  return body;
}

async function sendTelegram(env, chatId, text, extra = {}) {
  const body = await tgApi(env, 'sendMessage', { chat_id: chatId, text, ...extra });
  try {
    const parsed = JSON.parse(body);
    return (parsed.result && parsed.result.message_id) || null;
  } catch {
    return null;
  }
}

// ---- POST /api/sync ----
async function handleSync(request, env) {
  try {
    const body = await request.json();
    const userId = body && body.user_id;
    if (!userId) return json({ ok: false, error: 'missing user_id' }, 400);

    let leadMin = parseInt(body.leadMin, 10);
    if (!LEAD_OPTIONS.includes(leadMin)) leadMin = DEFAULT_LEAD_MIN;

    const syncDate = dateInTz((typeof body.tz === 'string' && body.tz) || 'UTC');
    const tasks = Array.isArray(body.tasks) ? body.tasks.map((t) => ({
      id: String(t.id || ''),
      name: String(t.name || ''),
      emoji: t.emoji != null ? String(t.emoji) : '',
      color: t.color != null ? String(t.color) : '#22a2f0',
      reminderTime: t.reminderTime ? String(t.reminderTime) : null,
      active: !!t.active,
      goal: Math.min(Math.max(parseInt(t.goal, 10) || 1, 1), 100),
      // doneToday валиден только на дату syncDate (снимок «на сегодня» в момент sync)
      doneToday: !!t.doneToday,
      doneDate: syncDate,
    })).filter((t) => t.id && t.reminderTime) : [];

    await env.VEYO_KV.put(
      `user:${userId}`,
      JSON.stringify({
        tz: (typeof body.tz === 'string' && body.tz) || 'UTC',
        leadMin,
        tasks,
        updatedAt: new Date().toISOString(),
      })
    );
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

// ---- GET /api/state (отметки «выполнено» из бота, для мержа в мини-аппе) ----
// Ответ: { ok, done: { <taskId>: ["YYYY-MM-DD", ...] }, tasks: [{ id, doneToday }] }
// tasks[].doneToday = есть отметка бота на сегодня — это читает мини-апп при мерже.
async function handleState(request, env, url) {
  try {
    const userId = url.searchParams.get('user_id');
    if (!userId) return json({ ok: false, error: 'missing user_id' }, 400);

    const done = {};
    let cursor;
    do {
      const page = await env.VEYO_KV.list({ prefix: `done:${userId}:`, cursor });
      for (const key of page.keys) {
        // done:<uid>:<YYYY-MM-DD>:<taskId>
        const rest = key.name.slice(`done:${userId}:`.length);
        const date = rest.slice(0, 10);
        const taskId = rest.slice(11);
        if (!date || !taskId) continue;
        (done[taskId] = done[taskId] || []).push(date);
      }
      cursor = page.cursor;
    } while (cursor);

    // tz пользователя нужен, чтобы вычислить «сегодня» для флага doneToday
    let today = dateInTz('UTC');
    try {
      const raw = await env.VEYO_KV.get(`user:${userId}`);
      if (raw) {
        const u = JSON.parse(raw);
        if (u.tz) today = dateInTz(u.tz);
      }
    } catch { /* дефолт UTC */ }

    const tasks = Object.keys(done)
      .filter((taskId) => done[taskId].includes(today))
      .map((taskId) => ({ id: taskId, doneToday: true }));

    return json({ ok: true, done, tasks });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

// выполнено ли сегодня (снимок из sync актуален только если sync был сегодня)
function isDoneToday(userData, userId, task, today) {
  if (task.doneDate === today && task.doneToday) return true;
  return false;
}

async function doneInKv(env, userId, taskId, today) {
  return !!(await env.VEYO_KV.get(`done:${userId}:${today}:${taskId}`));
}

// ---- POST /webhook (Telegram: message + callback_query) ----
async function handleWebhook(request, env) {
  try {
    const update = await request.json();

    // обычное сообщение: запоминаем chat_id
    const msg = update && (update.message || update.channel_post);
    if (msg) {
      const from = msg.from || msg.sender_chat;
      const chat = msg.chat;
      if (from && from.id && chat && chat.id) {
        await env.VEYO_KV.put(`chat:${from.id}`, String(chat.id));
      }
      return json({ ok: true });
    }

    // кнопка «Выполнено»
    const cq = update && update.callback_query;
    if (cq) {
      await handleDoneButton(cq, env);
      return json({ ok: true });
    }

    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

async function answerCq(env, cqId, text) {
  try {
    const payload = { callback_query_id: cqId };
    if (text) payload.text = text;
    await tgApi(env, 'answerCallbackQuery', payload);
  } catch (err) {
    console.error('answerCallbackQuery fail:', String(err));
  }
}

async function handleDoneButton(cq, env) {
  const data = String(cq.data || '');
  if (!data.startsWith('done:')) return;
  const taskId = data.slice('done:'.length);
  const from = cq.from;
  const userId = from && from.id;
  const cMsg = cq.message;
  if (!userId || !taskId) return;
  try { await answerCq(env, cq.id); } catch { /* не критично */ }

  const raw = await env.VEYO_KV.get(`user:${userId}`);
  if (!raw) return;
  let userData;
  try { userData = JSON.parse(raw); } catch { return; }

  const task = (userData.tasks || []).find((t) => t.id === taskId);
  if (!task) return; // задача удалена — молча игнорим

  const tz = userData.tz || 'UTC';
  const today = dateInTz(tz);

  const already = await env.VEYO_KV.get(`done:${userId}:${today}:${taskId}`);
  if (!already) {
    await env.VEYO_KV.put(`done:${userId}:${today}:${taskId}`, '1', { expirationTtl: DONE_TTL_SEC });
  }

  // редактируем сообщение: галочка, без кнопок
  if (cMsg && cMsg.chat && cMsg.message_id) {
    try {
      await tgApi(env, 'editMessageText', {
        chat_id: cMsg.chat.id,
        message_id: cMsg.message_id,
        text: `✅ ${taskIcon(task)} ${task.name} — выполнено`,
        reply_markup: { inline_keyboard: [] },
      });
    } catch (err) {
      console.error('editMessageText fail:', String(err));
    }
  }
}

// ---- Cron: доставка ----
async function deliverReminders(env) {
  if (!env.BOT_TOKEN) {
    console.error('BOT_TOKEN не задан');
    return;
  }
  const now = new Date();
  let cursor;
  do {
    const page = await env.VEYO_KV.list({ prefix: 'user:', cursor });
    for (const key of page.keys) {
      await deliverForUser(env, key, now);
    }
    cursor = page.cursor;
  } while (cursor);
}

async function deliverForUser(env, key, now) {
    const userId = key.name.slice('user:'.length);
    try {
      const raw = await env.VEYO_KV.get(key.name);
      if (!raw) return;
      const userData = JSON.parse(raw);
      if (!userData.tz || !Array.isArray(userData.tasks) || userData.tasks.length === 0) return;

      const chatId = await env.VEYO_KV.get(`chat:${userId}`);
      if (!chatId) return; // пользователь не открывал чат с ботом

      const tz = userData.tz;
      const today = dateInTz(tz, now);
      const nowHhmm = timeInTz(tz, now);
      const nowMin = parseHhmm(nowHhmm);
      if (nowMin === null) return;
      const leadMin = Number.isInteger(userData.leadMin) ? userData.leadMin : DEFAULT_LEAD_MIN;

      for (const task of userData.tasks) {
        if (!task || !task.reminderTime || !task.active) continue;
        const taskMin = parseHhmm(task.reminderTime);
        if (taskMin === null) continue;

        // задача уже выполнена сегодня (снимок sync сегодняшний или отметка из бота)
        const done = isDoneToday(userData, userId, task, today) || (await doneInKv(env, userId, task.id, today));

        // 1) предупреждение за leadMin минут до времени задачи
        if (!done && leadMin > 0) {
          const warnMin = (taskMin - leadMin + 1440) % 1440;
          if (nowMin === warnMin && !(await alreadySent(env, userId, today, task.id, 'warn'))) {
            const msgId = await sendTelegram(env, chatId, taskLine(task, true));
            await markSent(env, userId, today, task.id, 'warn');
            // запоминаем сообщение-предупреждение, чтобы удалить его, когда придёт уведомление
            if (msgId) {
              await env.VEYO_KV.put(`warnmsg:${userId}:${task.id}`, String(msgId), { expirationTtl: WARNMSG_TTL_SEC });
            }
          }
        }

        // 2) уведомление в само время задачи (+ кнопка «Выполнено», пока goal <= 1)
        if (!done && nowMin === taskMin && !(await alreadySent(env, userId, today, task.id, 'due'))) {
          const goal = task.goal || 1;
          const extra = goal <= 1
            ? { reply_markup: { inline_keyboard: [[{ text: '✅ Выполнено', callback_data: `done:${task.id}` }]] } }
            : {};
          await sendTelegram(env, chatId, taskLine(task, false), extra);
          await markSent(env, userId, today, task.id, 'due');
          // уведомление пришло — удаляем раннее предупреждение из чата
          const warnMsgId = await env.VEYO_KV.get(`warnmsg:${userId}:${task.id}`);
          if (warnMsgId) {
            try {
              await tgApi(env, 'deleteMessage', { chat_id: chatId, message_id: Number(warnMsgId) });
            } catch (err) {
              console.error(`delete warn msg fail user=${userId} task=${task.id}:`, String(err));
            }
            await env.VEYO_KV.delete(`warnmsg:${userId}:${task.id}`).catch(() => {});
          }
        }
      }
    } catch (err) {
      console.error(`deliver fail user=${userId}:`, String(err));
    }
}

async function alreadySent(env, userId, date, taskId, kind) {
  return !!(await env.VEYO_KV.get(`sent:${userId}:${date}:${taskId}:${kind}`));
}

async function markSent(env, userId, date, taskId, kind) {
  await env.VEYO_KV.put(`sent:${userId}:${date}:${taskId}:${kind}`, '1', { expirationTtl: SENT_TTL_SEC });
}

// ===================== Серверная синхронизация (вариант B) =====================
// /api/data — «тупое зеркало» состояния мини-аппа в KV snap:<user_id>.
// Авторизация: подпись tg.initData (алгоритм Telegram), user_id берём из initData — не из тела запроса.

const MAX_DATA_CHARS = 2_000_000; // данные мини-аппа на порядки меньше; KV лимит 25 MiB
const INITDATA_MAX_AGE_SEC = 48 * 3600; // initData старше 48ч не принимаем (защита от реплеев)

function bytesToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha256(keyBytes, dataBytes) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, dataBytes);
  return new Uint8Array(sig);
}

// Проверяем подпись initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app):
//   secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)   (сырые байты — ключ для шага ниже)
//   check_string = отсортированные по ключу пары key=value (кроме hash), join "\n"
//   hash = HMAC_SHA256(key=secret_key, data=check_string) (hex)
// Возвращает { userId } или null.
async function validateInitData(initData, botToken) {
  try {
    if (!initData || !botToken) return null;
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    const pairs = [];
    for (const [k, v] of params) if (k !== 'hash') pairs.push([k, v]);
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const checkString = pairs.map((p) => `${p[0]}=${p[1]}`).join('\n');

    const te = new TextEncoder();
    const secretKey = await hmacSha256(te.encode('WebAppData'), te.encode(botToken));
    const calcHash = bytesToHex(await hmacSha256(secretKey, te.encode(checkString)));
    if (!safeEqual(calcHash, hash)) return null;

    const authDate = parseInt(params.get('auth_date'), 10);
    if (!Number.isFinite(authDate)) return null;
    if (Date.now() / 1000 - authDate > INITDATA_MAX_AGE_SEC) return null;

    const userRaw = params.get('user');
    if (!userRaw) return null;
    const user = JSON.parse(userRaw);
    if (!user || !user.id) return null;
    return { userId: String(user.id) };
  } catch {
    return null;
  }
}

// GET /api/data?initData=... -> { ok, updatedAt:<ms|null>, data:<строка|null> }
async function handleDataGet(request, env, url) {
  try {
    const auth = await validateInitData(url.searchParams.get('initData') || '', env.BOT_TOKEN);
    if (!auth) return json({ ok: false, error: 'unauthorized' }, 401);
    const raw = await env.VEYO_KV.get(`snap:${auth.userId}`);
    if (!raw) return json({ ok: true, updatedAt: null, data: null });
    try {
      const parsed = JSON.parse(raw);
      return json({ ok: true, updatedAt: parsed.updatedAt ?? null, data: parsed.data ?? null });
    } catch {
      return json({ ok: true, updatedAt: null, data: null });
    }
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
  }
}

// POST /api/data { initData, updatedAt:<ms>, data:"<строка>" } — last-write-wins
async function handleDataPost(request, env) {
  try {
    const body = await request.json();
    const auth = await validateInitData((body && body.initData) || '', env.BOT_TOKEN);
    if (!auth) return json({ ok: false, error: 'unauthorized' }, 401);

    const updatedAt = body && body.updatedAt;
    const data = body && body.data;
    if (typeof updatedAt !== 'number' || !Number.isFinite(updatedAt) || updatedAt <= 0) {
      return json({ ok: false, error: 'invalid updatedAt' }, 400);
    }
    if (typeof data !== 'string') return json({ ok: false, error: 'invalid data' }, 400);
    if (data.length > MAX_DATA_CHARS) return json({ ok: false, error: 'data too large' }, 413);

    const snapKey = `snap:${auth.userId}`;
    let serverUpdatedAt = 0;
    const raw = await env.VEYO_KV.get(snapKey);
    if (raw) {
      try { serverUpdatedAt = JSON.parse(raw).updatedAt || 0; } catch { /* битый снап — перезапишем */ }
    }
    if (updatedAt <= serverUpdatedAt) {
      return json({ ok: true, saved: false, serverUpdatedAt }); // клиент пересинхронизируется
    }
    await env.VEYO_KV.put(snapKey, JSON.stringify({ updatedAt, data }));
    return json({ ok: true, saved: true, serverUpdatedAt: updatedAt });
  } catch (err) {
    return json({ ok: false, error: String((err && err.message) || err) }, 500);
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
    if (url.pathname === '/api/state' && request.method === 'GET') {
      return handleState(request, env, url);
    }
    if (url.pathname === '/api/data' && request.method === 'GET') {
      return handleDataGet(request, env, url);
    }
    if (url.pathname === '/api/data' && request.method === 'POST') {
      return handleDataPost(request, env);
    }
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }
    if (url.pathname === '/') {
      return json({ ok: true, service: 'veyo-reminders', version: 3 });
    }
    return json({ ok: false, error: 'not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(deliverReminders(env));
  },
};
