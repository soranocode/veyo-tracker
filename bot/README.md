# bot/ — Telegram-бот и доставка напоминаний Veyo Tracker

> **ТЕРРИТОРИЯ БОТ-АГЕНТА (OpenClaw).** Этот каталог закреплён за бот-агентом — другие агенты (в т.ч. кодер фронта) НЕ редактируют `bot/` без явной команды пользователя. Веб-файлы (корень репо, `telegram/`, `android/`) — территория кодера; правки UI синхронизируются по процедуре из корневого `AGENTS.md`.

Статус: **работает** (задеплоено 02.09.2026, DEV). Обновлено: 02.09.2026 18:05 (GMT+4).

---

## Что это

Система напоминаний: задачи в Mini App Veyo Tracker могут иметь `reminderTime` (HH:MM). Когда наступает это время (в таймзоне пользователя), Telegram-бот шлёт пользователю сообщение `Напоминание 💧 <имя задачи>`.

Локальный long polling-бот на grammY (`bot/index.js` + `package.json`) — **LEGACY, остановлен и не нужен**: его роль полностью исполняет Cloudflare Worker (webhook). Файлы оставлены для истории, можно удалить после подтверждения пользователя.

## Архитектура

```
Mini App (telegram/, CF Pages)                  Cloudflare Worker "veyo-reminders"          Telegram
┌─────────────────────────────┐   POST /api/sync  ┌───────────────────────────────────┐   sendMessage   ┌──────────┐
│ syncRemindersToBackend()    │ ─────────────────▶ │ fetch handler:                   │ ───────────────▶ │ @veyo_…  │
│ (в js/app.js, после save()  │   {user_id, tz,    │  • /api/sync  → KV user:<id>     │                 └──────────┘
│  и через 2.5с на init)      │    tasks:[...]}    │  • /webhook   → KV chat:<id>     │
└─────────────────────────────┘                    │  • /          → ping              │
                                                   │ scheduled (cron * * * * *):       │
                                                   │   время в tz == reminderTime →    │
                                                   │   sendMessage, дубль-защита       │
                                                   └───────────────────────────────────┘
```

## Компоненты

### 1. Cloudflare Worker `veyo-reminders` (папка `bot/worker/`)
- `src/index.js` — весь код (ESM), `wrangler.toml` — конфиг.
- URL: `https://veyo-reminders.okhotinandrei5.workers.dev`
- Деплой (из `bot/worker/`): `wrangler deploy`
- Секрет: `wrangler secret put BOT_TOKEN` (уже загружен; токен также в `bot/.env`, который в `.gitignore`)

Эндпоинты Worker:
| Путь | Назначение |
|---|---|
| `POST /api/sync` | Mini App шлёт `{user_id, tz, tasks:[{id,name,emoji,reminderTime,active}]}` → пишем KV `user:<tg_user_id>` = `{tz, tasks, updatedAt}`. CORS открыт (`*`). |
| `POST /webhook` | Telegram updates. Из любого сообщения сохраняет `chat:<from.id>` = chat_id. **На сообщения не отвечает** (режим «только плашка» — требование пользователя). |
| `GET /` | ping `{ok:true, service:'veyo-reminders'}` |
| cron `* * * * *` | для каждого `user:*`: текущее `HH:MM` в `tz` пользователя; для задач с `active && reminderTime === hhmm` → `sendMessage(chat_id, "Напоминание {emoji} {name}")`. Дубль-защита: ключ `sent:<user>:<дата>:<taskId>` TTL 24ч. |

### 2. KV namespace `VEYO_KV` (id `fe5149d08148451190642c7dd75eee6c`)
Ключи:
- `user:<tg_user_id>` → JSON `{tz, tasks, updatedAt}`
- `chat:<tg_user_id>` → chat_id (число строкой)
- `sent:<tg_user_id>:<YYYY-MM-DD>:<taskId>` → `1` (TTL 24ч)

**ВАЖНЫЙ НЮАНС:** `wrangler kv key list|get` на машине пользователя показывает пусто и ВРЁТ. Проверять через Cloudflare API:
`GET /client/v4/accounts/{account_id}/storage/kv/namespaces/{ns}/keys` (Authorization: Bearer <oauth_token из `C:\Users\user\.wrangler\config\default.toml`). Через API ключи реально видны.

### 3. Telegram-бот `@veyo_tracker_bot`
- Webhook: `https://veyo-reminders.okhotinandrei5.workers.dev/webhook` (установлен; `pending_update_count: 0`)
- Menu Button «Открыть Veyo Tracker» (тип web_app → dev URL) — установлена глобально через Bot API (см. legacy `bot/index.js`)
- Бот в режиме «только плашка»: поле ввода убрать нельзя (ограничение Telegram), бот молчит на все сообщения.

### 4. Веб-патч (территория кодера, но сделано бот-агентом 02.09)
В корневом `js/app.js` (и в копиях `telegram/`, `android/assets`):
- `syncRemindersToBackend()` — сбор задач с `reminderTime`, POST на `SYNC_ENDPOINT` (константа в файле = URL Worker `/api/sync`), только внутри Telegram Mini App (`tg.initDataUnsafe.user.id`), fire-and-forget, дебаунс 10с.
- Вызовы: в конце `save()` + `setTimeout(..., 2500)` в `init()`.
- Поле `active` задачи при синке: внутри периода (или без периода) && не выполнена сегодня (`completions[today] < goal`).
- Всё это уже в git (коммит `1d44d37` — кодер захватил рабочую копию).

## Команды

```powershell
# деплой Worker (из bot/worker/)
wrangler deploy

# секрет
wrangler secret put BOT_TOKEN

# деплой фронта DEV (из корня репо; wrangler.toml в корне НЕТ — не нужен)
wrangler pages deploy --project-name veyo-tracker-dev --branch main

# PROD — только по явной команде пользователя
# wrangler pages deploy --project-name veyo-tracker --branch main
```

## Окружение Cloudflare
- Аккаунт: okhotinandrei5@gmail.com (OAuth-токен wrangler в `C:\Users\user\.wrangler\config\default.toml`)
- Pages-проекты: `veyo-tracker-dev` (DEV, https://veyo-tracker-dev.pages.dev), `veyo-tracker` (ПРОД, не задеплоен)
- Worker: `veyo-reminders` → https://veyo-reminders.okhotinandrei5.workers.dev
- KV: `VEYO_KV` (`fe5149d08148451190642c7dd75eee6c`)
- Сеть ПК пользователя фильтрует TLS по SNI для `*.pages.dev` — с ПК фронт не открыть, проверять с телефона; `*.workers.dev` открывается.

## Статус теста (не завершён)
✅ /api/sync → KV: подтверждено (ключи `user:*` видны через API)
✅ webhook установлен, getMe ok
⬜ Сквозной тест доставки: пользователь должен открыть `@veyo_tracker_bot` (Start — чтобы сохранился `chat:<id>`), создать в DEV-мини-аппе задачу с напоминанием на ближайшую минуту, дождаться сообщения от бота.

## TODO / заметки
- Если сообщение не приходит: проверить 1) есть ли `chat:<user_id>` в KV, 2) попадает ли задача в KV (синк), 3) совпадение времени — cron работает по tz пользователя, переданной фронтом.
- PROD-мини-апп не задеплоен; задачи DEV и PROD будут писаться в один KV (ключ `user:<id>`) — при появлении PROD решить разделение (напр. суффикс окружения в ключе).
- Pages Function `telegram/functions/api/sync.js` пробовалась первой — удалена: KV к Pages-проекту не привязался ни через wrangler.toml, ни через PATCH API (400). Рабочий путь — единый Worker.
