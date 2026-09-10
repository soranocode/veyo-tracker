# bot/ — Telegram-бот и доставка напоминаний Veyo Tracker

> **ТЕРРИТОРИЯ БОТ-АГЕНТА (OpenClaw).** Этот каталог закреплён за бот-агентом — другие агенты (в т.ч. кодер фронта) НЕ редактируют `bot/` без явной команды пользователя. Веб-файлы (корень репо, `telegram/`, `android/`) — территория кодера; правки UI синхронизируются по процедуре из корневого `AGENTS.md`.

Статус: **работает (v8)**. Обновлено: 10.09.2026 ~12:35 (GMT+4). Деплои 10.09: worker **v8** `0efda55e` (кнопка/приветствие → ПРОД, убран текст «напомнит заранее», добавлены `/admin/broadcast` и `/admin/setmenubutton`), worker v7 `f4390395` (auth /api/sync + /api/state по initData), worker v6 `06448e25` (warn удалён + крон читает chat/done только в минуту уведомления), worker v5 `eb5c1dad` (приветствие на /start); фронт Pages dev v12 `42c9bff2` (initData в sync/state, leadMin убран из UI).
ПРОД-мини-апп **задеплоен** 10.09: https://veyo-tracker.pages.dev (v0.1.1; обновление — по явной команде пользователя). Фронт-деплои 10.09 (папка `telegram/`): **PROD** `995b1e26` (source `9af37d9`, alias veyo-tracker.pages.dev), **DEV** `c7bda6a5`.

---

## Что это

Система напоминаний Veyo Tracker: задача в мини-аппе имеет время `reminderTime` (HH:MM). Бот шлёт **одно уведомление** ровно в время задачи (в таймзоне пользователя): текст `{иконка} {название} — {HH:MM}` + кнопка `✅ Выполнено`.

> v6 (10.09): **предупреждение (warn) за N минут удалено** — раньше было два события (warn + due). Настройка `leadMin` в приложении больше не используется.

Иконка: эмодзи задачи; если эмодзи нет — **цветной кружок** по цвету задачи (маппинг палитры приложения: #22a2f0→🔵 #00b894→🟢 #fdcb6e→🟡 #e17055→🟠 #6c5ce7→🟣 #d63031→🔴 #e84393→🔴 #000000→⚫; неизвестный hex — ближайший по RGB из 🔵🟢🟡🟠🔴🟣🟤⚫⚪).

Правила:
- Задача выполнена до события → уведомление не шлётся (worker знает `doneToday`+`doneDate` из sync и свои отметки `done:*`)
- Кнопка «Выполнено» ставится всегда (фича «Цель» удалена 09.09)
- Нажатие кнопки → KV `done:<user>:<дата>:<taskId>` + сообщение редактируется в `✅ {иконка} {название} — выполнено` (кнопки убираются)
- **Кнопка несёт дату уведомления** (v4, P1): `callback_data = done:<YYYY-MM-DD>:<taskId>` — нажатие кнопки из вчерашнего уведомления НЕ отметит выполнение за сегодня («Это напоминание за другой день»); старые кнопки без даты отклоняются («Устарело…»).
- **Экономия чтений (v6)**: крон читает `chat:<id>` и `done:*` только в минуту уведомления, в остальные минуты — только `user:<id>`.
- Мини-апп при открытии тянет отметки через `GET /api/state` и мержит (задача показывается выполненной)
- **Приветствие в чате (v5)**: на `/start` бот в личке отвечает текстом + inline-кнопкой `🚀 Открыть Veyo Tracker` (web_app → URL мини-аппа). Остальные сообщения по-прежнему игнорируются. URL (v8): `env.MINI_APP_URL`, иначе дефолт — **ПРОД** `https://veyo-tracker.pages.dev`. Текст v8: «Ставь время — бот напомнит в срок» (слово «заранее» убрано — warn удалён ещё в v6).
- **Рассылка обновлений (v8)**: `POST /admin/broadcast` — анонс «вышло обновление X.Y.Z + что нового» всем, кто писал боту. Триггерится вручную (по команде пользователя), автоматом НЕ шлётся.

Локальный long polling-бот на grammY (`bot/index.js` + `package.json`) — **LEGACY, остановлен и не нужен**. Файлы для истории.

## Архитектура

```
Mini App (telegram/, CF Pages)                Cloudflare Worker "veyo-reminders"          Telegram
┌────────────────────────────┐  POST /api/sync ┌────────────────────────────────────┐ sendMessage ┌─────────┐
│ save() → syncReminders…() │ ───────────────▶ │ fetch:                             │ ──────────▶ │@veyo_…  │
│ init → cloudBoot + fetch… │  {initData,tz,   │  /api/sync  → KV user:<id>         │  editMessage└─────────┘
└────────────────────────────┘      tasks}     │  /api/state → отметки done (7 дн) │
                                               │  /api/data  → KV snap:<id> (v3)    │
                                               │  /webhook   → chat:<id>; /start    │
                                               │  /          → ping {version:8}     │
                                               │  cron * * * * *:                   │
                                               │   due = reminderTime (кнопка)      │
                                               └────────────────────────────────────┘
```

## Компоненты

### 1. Cloudflare Worker `veyo-reminders` (папка `bot/worker/`)
- `src/index.js` — весь код (ESM), `wrangler.toml` — конфиг. URL: `https://veyo-reminders.okhotinandrei5.workers.dev`
- Деплой (из `bot/worker/`): `wrangler deploy`; секрет: `wrangler secret put BOT_TOKEN` (токен также в `bot/.env`, в .gitignore)

Эндпоинты:
| Путь | Назначение |
|---|---|
| `POST /api/sync` | Mini App: `{initData, tz, tasks:[{id,name,emoji,color,reminderTime,active,doneToday}]}` (v7: user_id берётся ИЗ initData; лишний `leadMin` игнорируется) → `user:<id>` = `{tz, tasks:[…+doneDate], updatedAt}`. В KV сохраняются только задачи с `reminderTime`. `doneDate` = дата снимка в tz — вчерашний `doneToday` не блокирует сегодняшнее напоминание. |
| `GET /api/state?initData=` | (v7: `initData` вместо `user_id`) `{ok, done:{<taskId>:[даты]}, tasks:[{id, doneToday}]}` — done-отметки бота за 7 дней. Форму `tasks[].doneToday` читает мини-апп (мерж). |
| `POST /webhook` | **ТОЛЬКО от Telegram (v4, P3)**: заголовок `X-Telegram-Bot-Api-Secret-Token` = секрет `WEBHOOK_SECRET` (иначе 401). message → `chat:<from.id>` = chat_id (на `/start` в личке — приветствие с кнопкой, v5); `callback_query` data=`done:<YYYY-MM-DD>:<taskId>` → отметка done только за сегодня + editMessageText. |
| `GET /api/data?initData=` | (v3, серверная синхронизация) `{ok, updatedAt:<ms|null>, data:<строка|null>}` — снимок состояния мини-аппа из `snap:<user_id>`. Валидация initData: без подписи/с битой подписью/старше 48ч → 401. |
| `POST /api/data` | body `{initData, updatedAt:<ms>, data:"<json строкой>"}` — «тупое зеркало», last-write-wins: принимается только при `updatedAt > snap.updatedAt`; иначе `{saved:false, serverUpdatedAt}` (клиент пересинхронизируется). Лимит data: 2М символов. user_id берётся ИЗ initData, не из тела. |
| `GET /` | ping `{ok, service, version:8}` |
| `POST /admin/setwebhook` | служебный (P3): переустановить webhook с `secret_token`. Доступ: заголовок `X-Admin-Secret` = WEBHOOK_SECRET. Нужен, т.к. с ПК пользователя api.telegram.org недоступен (сеть), worker до Telegram ходит: `curl -X POST -H "X-Admin-Secret: <секрет>" https://veyo-reminders.okhotinandrei5.workers.dev/admin/setwebhook` |
| `POST /admin/broadcast` | (v8) рассылка анонса обновления всем, кто писал боту (у кого есть `chat:<id>`). body `{version:"X.Y.Z", notes:"что нового", force?:bool}` → текст `🚀 Вышло обновление Veyo Tracker X.Y.Z` + notes + «Открыть: <url>» + кнопка web_app «Открыть Veyo Tracker». Повтор той же версии без `force` не шлётся (KV `broadcast:last`); пачки по 10, ответ `{ok, total, sent, failed}`. |
| `POST /admin/setmenubutton` | (v8) поставить Menu Button бота на URL мини-аппа: body `{url?}` (по умолчанию `env.MINI_APP_URL` || ПРОД) → Telegram `setChatMenuButton` (тип web_app). |
| cron `* * * * *` | одно уведомление в время задачи (`due`), v6. Крон на юзера: 1 чтение `user:<id>`; `chat:<id>`/`done:*` — только в минуту уведомления. Защита от дублей: `sent:<user>:<дата>:<taskId>:due` TTL 2д. Пагинация по cursor (страницы по 1000). |

### 2. KV namespace `VEYO_KV` (id `fe5149d08148451190642c7dd75eee6c`)
- `user:<tg_user_id>` → `{tz, tasks:[{id,name,emoji,color,reminderTime,active,doneToday,doneDate}], updatedAt}` (v6: без `leadMin`)
- `chat:<tg_user_id>` → chat_id строкой (появляется только после /start или любого сообщения боту!)
- `done:<tg_user_id>:<YYYY-MM-DD>:<taskId>` → `1` (TTL 7д; источник для /api/state и крона)
- `sent:<tg_user_id>:<YYYY-MM-DD>:<taskId>:due` → `1` (TTL 2д)
- `snap:<tg_user_id>` → `{updatedAt:<ms>, data:"<полный JSON состояния приложения строкой>"}` (v3, без TTL; зеркало для серверного синка — вариант B)
- `broadcast:last` → строка-версия последней разосланной анонс-рассылки (v8; защита от повторной отправки той же версии)
- Секреты worker (wrangler secret put; значения также в `bot/.env`, .gitignore): `BOT_TOKEN`, `WEBHOOK_SECRET`

**ВАЖНО:** `wrangler kv key list|get` на машине пользователя ВРЁТ (пусто). Проверять через Cloudflare API:
`GET /client/v4/accounts/{account_id}/storage/kv/namespaces/{ns}/keys` (Bearer <oauth_token из `C:\Users\user\.wrangler\config\default.toml`). OAuth-токен протухает (~2ч) — перевыпуск: `wrangler whoami`.

### 3. Telegram-бот `@veyo_tracker_bot`
- Webhook: `https://veyo-reminders.okhotinandrei5.workers.dev/webhook` (`pending_update_count: 0`)
- Menu Button — кнопка слева от поля ввода в личке с ботом (тип web_app). **Переключена на ПРОД** 10.09 (10.09: `POST /admin/setmenubutton`, Telegram → `result:true`); вернуть dev — тем же вызовом с `{"url":"https://veyo-tracker-dev.pages.dev"}`
- Бот «только плашка»: молчит на сообщения (кроме `/start` — приветствие, v5), отвечает только действиями (кнопка)
- Переменная окружения `MINI_APP_URL` (опционально) — URL для приветственной кнопки; сейчас не задана, код использует **ПРОД** `https://veyo-tracker.pages.dev` (v8)

### 4. Мини-апп (территория кодера; критические правки делает бот-агент по команде пользователя)
Актуальная версия на Pages: **v12** (10.09; initData в sync/state, leadMin убран из UI) / v11 (welcome-окно для новых) / v10 (goal removed, e9f8bfb). Синк — серверный (вариант B). Что важно знать:
- **Welcome-окно (v11)**: показывается один раз только новым (нет данных и нет флага `habit-tracker-welcome`); кнопка «Начать» → флаг; флаг входит в зеркало синка (SYNC_LOCAL_KEYS) — на втором устройстве не выскочит повторно; после серверного пула данных окно закрывается автоматически.
- **Кросс-девайс синк (v9+/v10)**: CloudStorage-слой (v1.*) УДАЛЁН и заменён на зеркало в worker: при старте init() рендерит UI сразу из localStorage (кеш), затем cloudBoot() тянет `GET /api/data` и применяет, если сервер новее; после save/saveStats/saveSettings/saveHistory/savePlans/toggleTheme — cloudQueue() → `POST /api/data` (debounce 1.5с). Конфликт: last-write-wins по `updatedAt` (localStorage `habit-tracker-sync`). Вне TG — чисто локально.
- 09.09: фича «Цель (goal)» удалена (бинарное выполнение 0→1→0), кнопка «Выполнено» в боте — всегда. telegram/index.html пересобирался из корневого → версия поднята до `?v=10` (регенерация сбрасывает — см. AGENTS.md ⚠️).
- ⚠️ КОДЕР (opencode): слой синка — зона бот-агента, CloudStorage НЕ возвращать; пометки в шапке секции app.js, AGENTS.md, index.html.
- sync шлёт `initData`, `tz`, `color`, `doneToday`; `leadMin` больше не шлётся (предупреждение удалено); задачи без эмодзи — `emoji: ''` (фолбэк «🔔» был багом кодера, исправлен; НЕ возвращать).
- fetchState() вызывается в init (кнопка «Выполнено» → мерж в приложение).
- Настройка «предупреждать за N мин» **убрана из UI** (10.09, вместе с warn); `leadMin` в localStorage остаётся пустым объектом (для совместимости).
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
- Pages: `veyo-tracker-dev` (DEV live, фронт v12), `veyo-tracker` (**ПРОД** live — https://veyo-tracker.pages.dev, v0.1.1; деплой — только по команде пользователя)
- Worker: `veyo-reminders`; KV: `VEYO_KV` `fe5149d08148451190642c7dd75eee6c`
- С ПК `*.pages.dev` не открыть (SNI-фильтр сети) — проверять с телефона; `*.workers.dev` открывается

## Статус (09.09, v9 мини-апп + worker v3)
✅ Worker v3 `/api/data` + валидация initData: задеплоен (d488c742), тесты API прошли
✅ Мини-апп v9: слой синка заменён на сетевой, деплой Pages dev (9558ff3), live проверен (`app.js?v=9`)
⬜ E2E-тест пользователем (телефон ↔ Telegram Desktop, один аккаунт):
   1. телефон: добавить задачу → Desktop: открыть мини-апп → задача видна (дать серверу ~2-5с на запись)
   2. Desktop: отметить выполнение → телефон: переоткрыть → выполнено
   3. напоминания не сломались: бот шлёт уведомление (due) на задачу с временем

## Статус теста (09.09, worker v4 — фиксы аудита P1-P3)
✅ P3: /webhook без секрета / с битым секретом → 401; с верным → ok; setWebhook «Webhook was set» (secret_token зарегистрирован)
✅ P1: кнопка со старой формой (без даты) и с датой за 2020-01-01 — done НЕ пишется; с датой 2026-09-09 (сегодня, Europe/Samara) — пишется (проверено по KV)
✅ P2: (историч.) deleteWarnIfAny — удалён в v6 вместе с warn
✅ Регресс: ping version 4, /api/data без initData → 401 (не сломано)

## Статус теста (09.09, worker v3 /api/data)
✅ 401: без initData / битая подпись / auth_date старше 48ч
✅ POST→GET: снимок сохраняется и читается (валидная подпись)
✅ LWW: запись со старым updatedAt отклоняется (`saved:false`), с новым — принимается
✅ Событийная консистентность KV: при паузах 2–4с (реальный темп) расхождений нет; мгновенные запросы подряд (мс) могут читать устаревшую реплику — для одного юзера некритично

## Статус теста (03.09)
✅ sync/state/webhook/кнопка-колбэк: код live, ping version 2
✅ Доставка подтверждена пользователем вживую (бот написал 14:56; задача Freebuff)
✅ (историч.) warn→due→delete warn — предупреждение удалено в v6
⬜ E2E по шагам: задача на +2 мин → уведомление с кнопкой → кнопка → проверка в приложении → синк на втором устройстве

## Статус теста (10.09, worker v8 — ссылка на ПРОД + рассылка)
✅ Деплой v8 `aca3f709`; ping через `Invoke-WebRequest` → `version:8` (web_fetch отдавал кеш — не показатель)
✅ Текст приветствия без «заранее»; дефолтный URL кнопки — ПРОД `https://veyo-tracker.pages.dev`
⬜ `/admin/broadcast` живьём не запускался (нет команды пользователя на рассылку); код проверен синтаксически
✅ Menu Button переключён на ПРОД (10.09): `POST /admin/setmenubutton {url:ПРОД}` → Telegram `{"ok":true,"result":true}`

## Статус теста (10.09, worker v7 — auth по initData)
✅ /api/state без initData → 401; с валидным initData → 200 (сгенерирован подписью BOT_TOKEN)
✅ /api/sync с битым initData → 401; с валидным → 200 (запись в KV user:<id>)
✅ /api/data без initData → 401; с валидным → 200 (не сломано)
✅ ping `version:7`; /webhook без секрета → 401
✅ Фронт v12 задеплоен (Pages dev `42c9bff2`): sync/state шлют initData, leadMin из UI убран
⬜ Живой E2E с телефона: открыть мини-апп → sync/state с initData работают; напоминание приходит; кнопка работает

## TODO / открытые вопросы
- фича «Цель (раз в день)» удалена 09.09 → кнопка «Выполнено» теперь всегда
- предупреждение (warn) удалено 10.09 (v6) — одно уведомление в время задачи; настройка `leadMin` не используется
- Масштаб/лимиты KV (free: 100k чтений, 1k записей/сутки): после v6 для ~30 чел. влезаем (чтения ~45k/сутки); узкое место — записи, если фронт пишет снапшот на каждое сохранение → тогда писать снапшот только на входе/выходе. Свыше ~100 — планирование к точным минутам вместо сканирования
- PROD-мини-апп задеплоен 10.09 (https://veyo-tracker.pages.dev); он ходит в ТОТ ЖЕ worker/KV, что и DEV — разделение KV между DEV/PROD пока не сделано (данные общие, но ключи per-user, так что на практике пересечений нет)
- VK-версия: CloudStorage работает только в Telegram → для VK нужен бэкенд-синк (вариант B) — worker-часть (v3) готова, при старте VK переиспользовать /api/data
- /api/sync и /api/state авторизуются по initData (v7) — дыра с произвольным user_id закрыта
