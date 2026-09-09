# bot/ — Telegram-бот и доставка напоминаний Veyo Tracker

> **ТЕРРИТОРИЯ БОТ-АГЕНТА (OpenClaw).** Этот каталог закреплён за бот-агентом — другие агенты (в т.ч. кодер фронта) НЕ редактируют `bot/` без явной команды пользователя. Веб-файлы (корень репо, `telegram/`, `android/`) — территория кодера; правки UI синхронизируются по процедуре из корневого `AGENTS.md`.

Статус: **работает (v3)**. Обновлено: 09.09.2026 ~17:00 (GMT+4). Деплои: worker v3 (09.09, version id `d488c742`) — серверная синхронизация /api/data + валидация initData; Pages dev v8 (03.09 17:15).

---

## Что это

Система напоминаний Veyo Tracker: задача в мини-аппе имеет время `reminderTime` (HH:MM). Бот шлёт **два события** на задачу (в таймзоне пользователя):

1. **Предупреждение** за `leadMin` минут до времени задачи (настройка в приложении: 60/30/15/0, дефолт 30). Текст: `Напоминание: {иконка} {название} — {HH:MM}` — без кнопок.
2. **Уведомление** ровно в время задачи. Текст: `{иконка} {название} — {HH:MM}` + кнопка `✅ Выполнено`. Раннее предупреждение при этом **удаляется** из чата (deleteMessage).

Иконка: эмодзи задачи; если эмодзи нет — **цветной кружок** по цвету задачи (маппинг палитры приложения: #22a2f0→🔵 #00b894→🟢 #fdcb6e→🟡 #e17055→🟠 #6c5ce7→🟣 #d63031→🔴 #e84393→🔴 #000000→⚫; неизвестный hex — ближайший по RGB из 🔵🟢🟡🟠🔴🟣🟤⚫⚪).

Правила:
- Задача выполнена до события → событие не шлётся (worker знает `doneToday`+`doneDate` из sync и свои отметки `done:*`)
- Кнопка «Выполнено» ставится только при `goal <= 1` (goal>1 — отложено, механика не решена)
- Нажатие кнопки → KV `done:<user>:<дата>:<taskId>` + сообщение редактируется в `✅ {иконка} {название} — выполнено` (кнопки убираются)
- Мини-апп при открытии тянет отметки через `GET /api/state` и мержит (задача показывается выполненной)

Локальный long polling-бот на grammY (`bot/index.js` + `package.json`) — **LEGACY, остановлен и не нужен**. Файлы для истории.

## Архитектура

```
Mini App (telegram/, CF Pages)                Cloudflare Worker "veyo-reminders"          Telegram
┌────────────────────────────┐  POST /api/sync ┌────────────────────────────────────┐ sendMessage ┌─────────┐
│ save() → syncReminders…() │ ───────────────▶ │ fetch:                             │ ──────────▶ │@veyo_…  │
│ init → cloudBoot + fetch… │  {user_id,tz,    │  /api/sync  → KV user:<id>         │  deleteMessage│        │
└────────────────────────────┘   leadMin,tasks}│  /api/state → отметки done (7 дн) │  editMessage └─────────┘
                                               │  /api/data  → KV snap:<id> (v3)    │
                                               │  /webhook   → chat:<id>; кнопка    │
                                               │  /          → ping {version:3}     │
                                               │  cron * * * * *:                   │
                                               │   warn = reminderTime − leadMin    │
                                               │   due  = reminderTime (кнопка)     │
                                               └────────────────────────────────────┘
```

## Компоненты

### 1. Cloudflare Worker `veyo-reminders` (папка `bot/worker/`)
- `src/index.js` — весь код (ESM), `wrangler.toml` — конфиг. URL: `https://veyo-reminders.okhotinandrei5.workers.dev`
- Деплой (из `bot/worker/`): `wrangler deploy`; секрет: `wrangler secret put BOT_TOKEN` (токен также в `bot/.env`, в .gitignore)

Эндпоинты:
| Путь | Назначение |
|---|---|
| `POST /api/sync` | Mini App: `{user_id, tz, leadMin, tasks:[{id,name,emoji,color,reminderTime,active,goal,doneToday}]}` → `user:<id>` = `{tz, leadMin, tasks:[…+doneDate], updatedAt}`. В KV сохраняются только задачи с `reminderTime`. `doneDate` = дата снимка в tz — вчерашний `doneToday` не блокирует сегодняшнее напоминание. |
| `GET /api/state?user_id=` | `{ok, done:{<taskId>:[даты]}, tasks:[{id, doneToday}]}` — done-отметки бота за 7 дней. Форму `tasks[].doneToday` читает мини-апп (мерж). |
| `POST /webhook` | message → `chat:<from.id>` = chat_id; `callback_query` data=`done:<taskId>` → отметка done + editMessageText. |
| `GET /api/data?initData=` | (v3, серверная синхронизация) `{ok, updatedAt:<ms|null>, data:<строка|null>}` — снимок состояния мини-аппа из `snap:<user_id>`. Валидация initData: без подписи/с битой подписью/старше 48ч → 401. |
| `POST /api/data` | body `{initData, updatedAt:<ms>, data:"<json строкой>"}` — «тупое зеркало», last-write-wins: принимается только при `updatedAt > snap.updatedAt`; иначе `{saved:false, serverUpdatedAt}` (клиент пересинхронизируется). Лимит data: 2М символов. user_id берётся ИЗ initData, не из тела. |
| `GET /` | ping `{ok, service, version:3}` |
| cron `* * * * *` | см. схему событий выше. Защита от дублей: `sent:<user>:<дата>:<taskId>:<warn|due>` TTL 2д. `warnmsg:<user>:<taskId>` = message_id предупреждения (TTL 3д) → удаляется при due. Пагинация по cursor (страницы по 1000). |

### 2. KV namespace `VEYO_KV` (id `fe5149d08148451190642c7dd75eee6c`)
- `user:<tg_user_id>` → `{tz, leadMin, tasks:[{id,name,emoji,color,reminderTime,active,goal,doneToday,doneDate}], updatedAt}`
- `chat:<tg_user_id>` → chat_id строкой (появляется только после /start или любого сообщения боту!)
- `done:<tg_user_id>:<YYYY-MM-DD>:<taskId>` → `1` (TTL 7д; источник для /api/state и крона)
- `sent:<tg_user_id>:<YYYY-MM-DD>:<taskId>:<warn|due>` → `1` (TTL 2д)
- `warnmsg:<tg_user_id>:<taskId>` → message_id предупреждения (TTL 3д)
- `snap:<tg_user_id>` → `{updatedAt:<ms>, data:"<полный JSON состояния приложения строкой>"}` (v3, без TTL; зеркало для серверного синка — вариант B)

**ВАЖНО:** `wrangler kv key list|get` на машине пользователя ВРЁТ (пусто). Проверять через Cloudflare API:
`GET /client/v4/accounts/{account_id}/storage/kv/namespaces/{ns}/keys` (Bearer <oauth_token из `C:\Users\user\.wrangler\config\default.toml`). OAuth-токен протухает (~2ч) — перевыпуск: `wrangler whoami`.

### 3. Telegram-бот `@veyo_tracker_bot`
- Webhook: `https://veyo-reminders.okhotinandrei5.workers.dev/webhook` (`pending_update_count: 0`)
- Menu Button «Открыть Veyo Tracker» (web_app → dev URL) установлена
- Бот «только плашка»: молчит на сообщения, отвечает только действиями (кнопка)

### 4. Мини-апп (территория кодера; критические правки делает бот-агент по команде пользователя)
Актуальная версия на Pages dev: **v9** (09.09, коммит 9558ff3) — серверный синк (вариант B). Что важно знать:
- **Кросс-девайс синк (v9)**: CloudStorage-слой (v1.*) УДАЛЁН и заменён на зеркало в worker: при старте init() рендерит UI сразу из localStorage (кеш), затем cloudBoot() тянет `GET /api/data` и применяет, если сервер новее; после save/saveStats/saveSettings/saveHistory/savePlans/toggleTheme — cloudQueue() → `POST /api/data` (debounce 1.5с). Конфликт: last-write-wins по `updatedAt` (localStorage `habit-tracker-sync`). Вне TG — чисто локально.
- ⚠️ КОДЕР (opencode): слой синка — зона бот-агента, CloudStorage НЕ возвращать; пометки в шапке секции app.js, AGENTS.md, index.html.
- sync шлёт `leadMin`, `color`, `goal`, `doneToday`; задачи без эмодзи — `emoji: ''` (фолбэк «🔔» был багом кодера, исправлен; НЕ возвращать).
- fetchState() вызывается в init (кнопка «Выполнено» → мерж в приложение).
- Дефолт настройки lead = 30 (кодер дважды откатывал на 0 — следить!).
- ⚠️ Кодер работает со СТАРОЙ копией и своими коммитами откатывал правки бот-агента в `telegram/` (3 раза 03.09). Координация: перед коммитами кодера он должен синхронизироваться с HEAD репозитория.

## Команды
```powershell
# деплой Worker (из bot/worker/)
wrangler deploy

# деплой фронта DEV (из папки telegram/)
cd telegram; wrangler pages deploy . --project-name veyo-tracker-dev --branch main

# PROD — только по явной команде пользователя
```

## Окружение Cloudflare
- Аккаунт: okhotinandrei5@gmail.com (OAuth wrangler в `C:\Users\user\.wrangler\config\default.toml`)
- Pages: `veyo-tracker-dev` (DEV live), `veyo-tracker` (PROD не задеплоен)
- Worker: `veyo-reminders`; KV: `VEYO_KV` `fe5149d08148451190642c7dd75eee6c`
- С ПК `*.pages.dev` не открыть (SNI-фильтр сети) — проверять с телефона; `*.workers.dev` открывается

## Статус (09.09, v9 мини-апп + worker v3)
✅ Worker v3 `/api/data` + валидация initData: задеплоен (d488c742), тесты API прошли
✅ Мини-апп v9: слой синка заменён на сетевой, деплой Pages dev (9558ff3), live проверен (`app.js?v=9`)
⬜ E2E-тест пользователем (телефон ↔ Telegram Desktop, один аккаунт):
   1. телефон: добавить задачу → Desktop: открыть мини-апп → задача видна (дать серверу ~2-5с на запись)
   2. Desktop: отметить выполнение → телефон: переоткрыть → выполнено
   3. напоминания не сломались: бот по-прежнему шлёт warn/due на задачу с временем

## Статус теста (09.09, worker v3 /api/data)
✅ 401: без initData / битая подпись / auth_date старше 48ч
✅ POST→GET: снимок сохраняется и читается (валидная подпись)
✅ LWW: запись со старым updatedAt отклоняется (`saved:false`), с новым — принимается
✅ Событийная консистентность KV: при паузах 2–4с (реальный темп) расхождений нет; мгновенные запросы подряд (мс) могут читать устаревшую реплику — для одного юзера некритично

## Статус теста (03.09)
✅ sync/state/webhook/кнопка-колбэк: код live, ping version 2
✅ Доставка подтверждена пользователем вживую (бот написал 14:56; задача Freebuff)
✅ warn→due→delete warn: реализовано (деплой 15:54), живого прогона «удаления» пока не подтверждено
⬜ E2E по шагам: задача на +2 мин → предупреждение → уведомление с кнопкой → кнопка → проверка в приложении → синк на втором устройстве

## TODO / открытые вопросы
- goal > 1: механика кнопки «Выполнено» не решена (сейчас кнопка только при goal=1)
- 100+ пользователей: лимиты бесплатного KV (крон раз в минуту делает list+чтения на всех; при массовом использовании — переделка: планирование к точным минутам вместо сканирования)
- PROD-мини-апп не задеплоен; при появлении — решить разделение KV между DEV/PROD
- VK-версия: CloudStorage работает только в Telegram → для VK нужен бэкенд-синк (вариант B) — worker-часть (v3) готова, при старте VK переиспользовать /api/data
- /api/sync и /api/state принимают user_id без проверки (TODO в коде): добавить валидацию initData, когда мини-апп начнёт слать initData (v9+)
