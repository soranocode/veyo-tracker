# ПЛАН ВНЕДРЕНИЯ: серверная синхронизация данных Veyo Tracker (вариант B)

> ⚠️ **ХЕНДОФФ-ДОКУМЕНТ. Прочитай этот файл ПОЛНОСТЬЮ, затем УДАЛИ ЕГО**
> (`Remove-Item SYNC_PLAN_B.md` / `rm`) и закоммить удаление, чтобы мусор не копился.
> Если ты НЕ будешь реализовывать план — сообщи пользователю и тоже удали файл.
> После реализации обнови документацию (см. раздел «По завершении»).

- Создан: 03.09.2026 ~17:35 (GMT+4), бот-агент OpenClaw
- Статус: **не начато**
- Исполнитель: агент, которому пользователь передал этот файл
- Репозиторий: `C:\Users\user\habit-tracker`

---

## 1. Проблема

Мини-апп Veyo Tracker хранит данные в localStorage (на устройстве). Телефон и компьютер (Telegram Desktop) одного аккаунта показывают РАЗНЫЕ данные.

03.09 внедрён вариант A — дублирование в **Telegram CloudStorage** (`telegram/js/app.js`, коммит 60a793f, Pages v8). НО: **Telegram Desktop не поддерживает CloudStorage** (клиентская функция, есть не во всех клиентах) → на Desktop синхронизации нет. Подтверждено пользователем (открывает мини-апп именно в Telegram Desktop).

Вариант B = **серверная синхронизация**: единое хранилище на нашем Cloudflare Worker (KV) — работает из любого клиента (Desktop, телефон, web.telegram.org, будущий VK).

## 2. Текущая архитектура (не ломать!)

```
Mini App (telegram/js/app.js, CF Pages veyo-tracker-dev)
├── localStorage: habit-tracker-data / -plans / -history / -stats / -settings / -theme / -lifetime
├── Telegram CloudStorage (v1.<key>#<n>, куски ≤3500 байт): cloudBoot→cloudPull при старте,
│   cloudQueue после save/saveStats/saveSettings/saveHistory/savePlans/toggleTheme (debounce 0.6с)
├── syncRemindersToBackend(): POST https://veyo-reminders.okhotinandrei5.workers.dev/api/sync
│   {user_id, tz, leadMin, tasks:[{id,name,emoji,color,reminderTime,active,goal,doneToday}]} (напоминания)
└── fetchState(): GET .../api/state?user_id= → {done, tasks:[{id,doneToday}]} (кнопка «Выполнено» из бота)
```

Cloudflare Worker `veyo-reminders` (папка `bot/worker/` — **ТЕРРИТОРИЯ БОТ-АГЕНТА**, подробности в `bot/README.md`):
- KV `VEYO_KV` (id fe5149d08148451190642c7dd75eee6c): ключи `user:<id>`, `chat:<id>`, `done:<id>:<дата>:<taskId>`, `sent:…`, `warnmsg:…`
- cron раз в минуту: предупреждение за leadMin и уведомление в время задачи с кнопкой «✅ Выполнено» (удаляет предупреждение)
- Бот @veyo_tracker_bot, webhook на worker

**Зоны ответственности:** `bot/` — бот-агент (OpenClaw), НЕ трогать без явной команды пользователя. `telegram/`, корень, `android/` — кодер-фронт (opencode, rragulin). Если план выполняет кодер — он делает ТОЛЬКО раздел 4 (мини-апп); раздел 3 (worker) делает бот-агент. Если план выполняет бот-агент — делает оба раздела.

**⚠️ Кодер работает со старой копией и СВОИМИ коммитами ОТКАТЫВАЛ чужие правки в `telegram/js/app.js` (03.09 — 3 раза).** Перед любой правкой: `git pull`/сверить с HEAD. НЕ откатывать: `emoji: h.emoji || ''` (не 🔔), дефолт leadMin=30, вызов fetchState() в init, облачный слой.

## 3. Worker: новые эндпоинты (бот-зона)

Добавить в `bot/worker/src/index.js` (рядом с /api/sync, /api/state):

### 3.1 KV
- `snap:<user_id>` → JSON `{updatedAt: <ISO ms>, data: "<полный JSON состояния приложения строкой>"}` (без TTL). Value до 25 MiB — запас огромный.

### 3.2 Авторизация по initData (ОБЯЗАТЕЛЬНО — сейчас /api/sync принимает user_id без проверки, для «100 друзей» это дыра)
Клиент шлёт сырой `tg.initData` (query string). Валидация (алгоритм Telegram):
```
secret_key = HMAC_SHA256(key="WebAppData", data=BOT_TOKEN)          // hex
check_string = отсортированные по ключу пары key=value из initData (кроме hash), join "\n"
hash = HMAC_SHA256(key=secret_key, data=check_string)               // hex
сравнить hash с полем hash из initData (constant-time)
auth_date: не старше 24–48ч (защита от реплеев)
user.id из JSON-поля user — рабочее user_id
```
BOT_TOKEN доступен в env worker. На /api/sync и /api/state валидацию добавить тоже (обратная совместимость: пока можно принимать и старый формат без initData — но пометить TODO).

### 3.3 Эндпоинты
| Путь | Назначение |
|---|---|
| `GET /api/data?initData=…` | Вернуть `{ok:true, updatedAt:<ms|null>, data:<строка или null>}` |
| `POST /api/data` | body `{initData, updatedAt:<ms>, data:"<json строкой>"}`. Принять, только если `updatedAt > snap.updatedAt` (last-write-wins). Ответ `{ok:true, saved:true, serverUpdatedAt}`. При устаревшем — `{ok:true, saved:false, serverUpdatedAt}` — клиент пересинхронизируется |

Данные worker НЕ разбирает — «тупое зеркало» (строка). updatedAt генерирует клиент.

### 3.4 Деплой
`cd bot/worker; wrangler deploy` → проверить `GET /` (ping). Лимиты бесплатного KV (100k чтений/1k записей/1k list в день) — для трекера запас есть; при 100+ юзерах пересмотреть крон (TODO отдельно).

## 4. Мини-апп: заменить CloudStorage-слой на сетевой (кодер/бот-агент — по зонам)

Файл: `telegram/js/app.js` (правки) + `telegram/index.html` (bump `app.js?v=8` → `?v=9`).

### 4.1 Что сделать
1. Сохранить CloudStorage-код? — НЕТ: заменить. Слой синхронизации теперь:
   - **Хранилище-кэш**: localStorage (как сейчас, неизменно — весь UI читает его)
   - **Зеркало метаданных**: localStorage ключ `habit-tracker-sync` = `{updatedAt: <ms>}` (когда последний раз меняли локально/синхронизировались)
   - **boot (вместо cloudBoot)**: если есть `tg.initData` → `GET /api/data?initData=…` (таймаут ~4с):
     - сервер пуст (`data` null) → если локально есть данные → push с `updatedAt = Date.now()`; если локально пусто → ничего
     - сервер есть: `server.updatedAt > localSync.updatedAt` → применить server.data в localStorage (распарсить JSON и разложить по ключам habit-tracker-*), обновить localSync, потом init()
     - `server.updatedAt < localSync.updatedAt` → push локальное (локальное новее)
   - **push (вместо cloudQueue)**: после каждой точки сохранения (save, saveStats, saveSettings, saveHistory, savePlans, toggleTheme — те же места) debounce ~1.5–2с → `POST /api/data {initData: tg.initData, updatedAt: Date.now(), data: JSON.stringify(все habit-tracker-* ключи объектом {key:value})}`. При неудаче — тихо, повторить при следующем изменении (pending-флаг).
   - Вне TG (нет initData/tg) — чисто локально, как в dev-браузере.
2. CloudStorage-ключи `v1.*`, оставшиеся в облаке TG, можно не чистить (мёртвый груз, не мешает) — либо очистить через removeItem при первой загрузке v9 (опционально).
3. syncRemindersToBackend/fetchState/кнопки/напоминания — НЕ трогать.
4. Конфликт одновременных правок: «чей updatedAt больше — тот прав» (для одного пользователя достаточно; полноценный merge не делаем).

### 4.2 Формат data на сервере (как класть)
```
data = JSON.stringify({
  "habit-tracker-data": "<значение из localStorage>",
  "habit-tracker-plans": "…",
  "habit-tracker-history": "…",
  "habit-tracker-stats": "…",
  "habit-tracker-settings": "…",
  "habit-tracker-theme": "…",
  "habit-tracker-lifetime": "…"
})
```
Пустые/отсутствующие ключи можно не включать. При pull — `JSON.parse(data)` и `localStorage.setItem` по каждому ключу.

### 4.3 Деплой фронта
`cd C:\Users\user\habit-tracker\telegram; wrangler pages deploy . --project-name veyo-tracker-dev --branch main`

## 5. Порядок работ (чеклист)

1. [ ] бот-агент: worker — /api/data + валидация initData → deploy → проверить curl'ом (без initData → 401; с валидным → ok)
2. [ ] исполнитель: мини-апп — замена слоя (4.1) → `node --check telegram/js/app.js` → bump v=9 → deploy Pages dev
3. [ ] E2E (пользователь): телефон и Telegram Desktop, один аккаунт:
   - телефон: добавить задачу → Desktop: открыть мини-апп → задача видна
   - Desktop: отметить выполнение → телефон: переоткрыть → выполнено
   - напоминания не сломались (бот по-прежнему шлёт warn/due)
4. [ ] git: закоммитить изменения (сообщение по смыслу, например «Feat: server sync (variant B)»)

## 6. По завершении (ОБЯЗАТЕЛЬНО)

1. Обновить `bot/README.md` (бот-агент): раздел «Мини-апп» — CloudStorage → серверная синхронизация; новые эндпоинты /api/data; статус.
2. Обновить память бот-агента (memory/2026-09-03.md или новая дата + MEMORY.md раздел Veyo): вариант B внедрён, версии, коммиты.
3. **Удалить этот файл и закоммитить удаление.**
4. Отчитаться пользователю: что сделано, версии деплоев, что проверить.

## 7. Справочно

- Вопрос «100 друзьям — заработает?»: данные изолированы по user_id; initData-валидация обязательна; лимиты бесплатного KV — вопрос масштаба, решать отдельно.
- VK-мини-апп (будущее): у VK свой initData/подпись — эндпоинты /api/data переиспользуются, добавится VK-валидатор. CloudStorage TG там недоступен в принципе — вариант B это закрывает.
