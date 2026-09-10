# AGENTS.md — контекст проекта Task Tracker

Прочитай этот файл целиком перед работой над проектом. Он содержит всё, что сделано и как устроен проект.
Обновлено: 10 сентября 2026 г.

## Что это за проект

Приложение «Veyo Tracker» (бренд, ребрендинг 02.09) — трекер задач с планированием вперёд. ВАЖНО: в UI используется слово «ЗАДАЧА», не «привычка» — пользователь просил, чтобы везде был термин «задача»:
- задача создаётся на выбранный период (от 1 дня до 1 года);
- вместо истории показывается «План на период» — лента дней от начала периода до конца, клик по дню отмечает выполнение;
- статистика: серия дней, выполнено сегодня, всего выполнено, прогресс периода.

## Архитектура: три версии одного приложения

```
habit-tracker/
├── index.html          # веб-версия (источник правды для UI)
├── css/style.css       # стили (светлая/тёмная тема через data-theme)
├── js/app.js           # вся логика (vanilla JS, IIFE)
├── telegram/           # версия для Telegram Mini App (копия веб-версии + SDK)
│   ├── index.html      # отличается: <script src="https://telegram.org/js/telegram-web-app.js"> в <head>
│   ├── css/style.css   # КОПИЯ корневого
│   └── js/app.js       # КОПИЯ корневого
└── android/            # проект Android Studio (WebView-обёртка)
    ├── app/src/main/java/com/veyotracker/app/MainActivity.kt
    ├── app/src/main/assets/          # КОПИЯ веб-файлов (index.html, css/, js/)
    └── app/src/main/res/             # темы, строки, иконка
```

**ВАЖНО про синхронизацию**: правки UI/логики делаются ТОЛЬКО в корневых файлах (index.html, css/style.css, js/app.js), затем КОПИРУЮТСЯ:
1. В `android/app/src/main/assets/` (все 3 файла)
2. В `telegram/` — css и js копируются, а `telegram/index.html` строится из корневого index.html с двумя заменами (viewport + SDK-тег). Прямой Copy-Item НЕЛЬЗЯ: затрут SDK.

Правильная команда обновления telegram/index.html (PowerShell, из корня проекта):
```powershell
$root = [System.IO.File]::ReadAllText("$PWD\index.html", [System.Text.Encoding]::UTF8)
$tg = $root.Replace('<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
  '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">')
  .Replace('</head>', '    <script src="https://telegram.org/js/telegram-web-app.js"></script>' + "`n</head>")
[System.IO.File]::WriteAllText("$PWD\telegram\index.html", $tg, [System.Text.UTF8Encoding]::new($false))
```
Все копирования — через PowerShell `[System.IO.File]::WriteAllText(...UTF8)`, чтобы не ломать кириллицу!

## Ключевая логика (js/app.js)

- Хранение: `localStorage` ключи `habit-tracker-data` (JSON массива задач), `habit-tracker-theme`.
- Модель задачи: `{ id, name, emoji, color, periodDays, startDate: string|off, completions: { 'YYYY-MM-DD': count }, lifetimeCount, createdAt, reminderTime: 'HH:MM'|null }`.
- Статистика: постоянные счётчики `habit-tracker-stats` = { total, today, todayDate }: `stats.total` («Всего выполнено») увеличивается при каждом полностью выполненном дне задачи, НЕ сбрасывается удалением задач из главного меню; `stats.today` («Сегодня») обнуляется ТОЛЬКО при наступлении нового дня (todayDate !== today на init). Удаление записи ИЗ ИСТОРИИ уменьшает счётчики на 1 (total всегда, today если запись была сегодня); уменьшение счётчиков также происходит при отмене выполнения (3/3→0), пока запись ещё в истории. Удаление задач из главного списка счётчики и серию дней НЕ прерывает.
- Задачи БЕЗ периода: `periodDays: null` (тоггл «Без периода» в модалке). Висит как задача (нет строки в «Плане на период», нет «% за период», не влияет на серию дней). При выполнении удаляется на следующий день (purge на init), но счётчик выполнений сохраняется: `habit.lifetimeCount` (карточка «выполнено всего: N»); глобальные счётчики лежат в stats (см. выше).
- Планы: период плана НЕ влияет на % задач — % задачи = полностью выполненные дни / собственный период задачи (дефолт 30, если нет); % плана = среднее арифметическое % задач. Лента задачи в «Плане на период» (buildPlanRow) рисуется ПО ЕЁ СОБСТВЕННОМУ периоду от startDate плана (не по периоду плана) — исправлено 09.09 (был баг: ячейки за пределами периода задачи кликались, но в % не попадали).
- Даты ТОЛЬКО локальные (`localDateStr`), не `toISOString()` (был баг со сдвигом дня).
- Период: `endDateOf(habit)` = startDate + periodDays - 1. Отмечать можно любой день внутри периода (в т.ч. будущие — планирование).
- Кнопка «+» в карточке и клик по ячейке плана: бинарный тоггл — клик отмечает день выполненным, повторный клик снимает (0→1→0). Фича «Цель (раз в день)» УДАЛЕНА 09.09 вместе со всей связанной логикой (поле goal, карусель 0..N, partial-ячейки плана); выполнение = `count > 0`.

### Период (слайдер + ручной ввод) — РЕАЛИЗОВАНО 31.08
- Шкала ступенчатая: `PERIOD_STEPS = [1,2,3,4,5,6,7,14,21,28,30,60,90,120,150,180,210,240,270,300,330,360]` (сначала дни 1-6, потом недели 7/14/21/28, потом месяцы 30..360).
- Слайдер `#periodSlider` прилипает к ближайшей ступени через `nearestStep()`.
- Пресеты-кнопки: 1 дн, 1 нед, 2 нед, 4 нед, 1/2/3/6 мес, 1 год. Помечается `data-selected="true"`.
- Отрисовка: `#periodDisplay` (большая плашка «N дней • изменить»), клик → модалка `#periodInputOverlay` с числовым полем `#periodCustomDays` (1-365).
- `formatPeriod(days)` форматирует «N дней» / «2 недели 3 дня» / «1 месяц 2 недели 3 дня» (месяц=30, неделя=7, остатки в дни).
- Функции `setPeriod()`, `openPeriodInput()`, `closePeriodInput()`, `updatePeriodCustomResult()` ОБЯЗАТЕЛЬНО живут на уровне IIFE (НЕ внутри init!) — их вызывает `openModal()`. Был баг ReferenceError, когда они оказались внутри init (кнопка «+ Задача» не работала).
- При редактировании задачи период подтягивается (`setPeriod(habit.periodDays)`), при новой — `setPeriod(30)`.

### Эмодзи и автозаполнение названия
- Кастомное поле `#customEmoji` (плейсхолдер «Введи свой смайлик»), отдельный блок `.emoji-group` выше названия в модалке.
- Карта `EMOJI_DEFAULTS` (~80 эмодзи с категориями-комментариями): ключ = эмодзи, значение = название задачи.
- Автозаполнение ТОЛЬКО в режиме новой задачи (`editingId === null`), и НЕ перезаписывает то, что пользователь сам ввёл: флаг `userEditedName` ставится в `input` на поле названия; `applyEmojiName()` проигрывает `if (userEditedName) return`.
- iOS добавляет к эмодзи невидимый `U+FE0F` — есть `emojiKey()` (срезает FE0F) и `EMOJI_LOOKUP` (карта, построенная через emojiKey), чтобы совпадало при вводе.
- `syncPresetSelection()` подсвечивает кнопку-пресет, если введённый эмодзи совпадает с ним.
- `normalizeEmoji()` стал мягким (просто `substring(0,8)`), агрессивную фильтрацию убрали — мобильный emoji picker отдаёт корректные последовательности.
- **Кнопка «Без смайлика»** (03.09): первая в пикере, CSS-квадратик с зачёркиванием (`.no-emoji-btn::after` + `::before`), `data-emoji=""`. При выборе задача сохраняется с пустым эмодзи, на карточке рисуется цветной кружок (`.habit-emoji.no-emoji`).
- **Тоггл**: повторный клик по выбранной иконке сбрасывает на «Без смайлика». Дефолт при создании — «Без смайлика».
- Список пресет-иконок в модалке: ❌ 💧 🏃 📚 🏋️ 💤 🍎 💊 🧹 🚶 🎯 📺 (❌ = без смайлика, 📺 вернули после ошибочного удаления).
- `:hover` на иконках: только `@media (hover: hover) and (pointer: fine)` — на тач-устройствах hover не «залипает» после тапа. `focus-visible` outline убран с `.emoji-btn` (был источником «фантомной обводки» при двойном клике).

### Напоминания (эпик начат 02.09 — UI готов, доставка сообщений ботом)
- В модалке задачи блок «Напоминание»: `#reminderDisplay` (плашка «Не напоминать | выбор времени», как periodDisplay).
- Оверлей `#timeInputOverlay`: барабан `#wheelHours`/`#wheelMinutes` (24×60, scroll-snap, шаг 44px, padding 66px для центровки), ручной ввод `#timeManual` (ЧЧ:ММ, бесплатно любой минуты — колесо тоже 1 мин), пресеты-чипы `#timePresets` (08:00 Утро, 12:00 День, 19:00 Вечер, 22:00 Ночь), кнопка «Не напоминать» (`#timeClear` сбрасывает), «Готово`/`Отмена`.
- Логика на уровне IIFE: `openTimePicker()`, `closeTimePicker()`, `updateReminderDisplay()`, `ensureWheelBuilt()`, `syncWheelToDraft()`, `syncDraftFromWheel(col)`, `parseTimeStr()`, `pad2()`; draft-переменные `reminderTimeCurrent` (сабмит в модель) и `reminderTimeDraft`.
- Данные: `habit.reminderTime` ('HH:MM'|null) в localStorage, на карточке бейдж `• 🔔 HH:MM`.
- **Настройки** (03.09): модалка `#settingsOverlay`. Блок «За сколько минут напоминать» (`leadMin`) **удалён 10.09** вместе с предупреждением (warn) — теперь в модалке только плашка версии.
- Бот-доставка: Cloudflare Worker `veyo-reminders` (POST /api/sync → KV `VEYO_KV`; авторизация по `initData`), эндпоинт `/api/state` (GET, отдаёт done-отметки + TZ; тоже по `initData`). Cron раз в минуту: **одно** уведомление в само время задачи (тип `due`) + кнопка «✅ Выполнено» (всегда). Предупреждение (warn) **удалено 10.09**. Защита от дублей через KV `sent:<userId>:<date>:<taskId>:due`. Отметка «Выполнено» из бота → KV `done:...` + editMessageText. ВАЖНО: `bot/` — зона бот-агента, фронт-кодер НЕ редактирует.

### Дизайн (ребрендинг 02.09 — палитра от иконки Veyo)
- Бренд-градиент иконки: `#31C7F8 → #1A95EA`, `--primary: #22a2f0`; фиолетовый убран.
- Светлая тема: фон-градиент `#E9F6FE → #E7F0F9`, поверхности белые, текст/бордеры голубоватые.
- Тёмная тема: `#13233D → #0C1728` (вместо прежней фиолетовой ночи).
- Палитра цветов задач: #22a2f0 (бренд), #00b894, #fdcb6e, #e17055, #6c5ce7, #e84393, #d63031, #000000.
- Android themes.xml окна в тон: светлый `#E9F6FE`, тёмный `#13233D`.

### Версия приложения
- Текущая версия: **0.1.1**.
- В модалке «Настройки» (`#settingsOverlay`) снизу — неяркая плашка `.app-version` «Veyo Tracker vX.Y.Z» (в конце `.modal`, вне `.settings-body`).
- ПРАВИЛО: когда пользователь говорит «меняем версию на X.Y.Z» — менять номер ТОЛЬКО в этой плашке (root index.html), затем копировать в android assets и пересобирать telegram/index.html (процедура выше). Отдельного файла версии нет.

### Прочее
- План-секция на главном экране: кнопка `📅` для создания плана показывается всегда, даже если все задачи «без периода» (раньше скрывалась при `habits.length > 0`). Логика: `renderPlan()` считает `hasContent` по непустым планам и непериодным задачам; если `!hasContent` — рисует empty-state.
- Серия дней (=`stats.streak`, считается ПО ИСТОРИИ `habit-tracker-history`): день засчитывается при первом выполненном задании за день (любой); если сегодня ещё не было выполнений — серия ведётся со вчера; удаление записей из истории прерывает серию (день без записей не считается); удаление задач из главного меню серию НЕ рвёт.
- Прогресс периода: выполненные дни / суммарные дни периодов.
- Тема: `applyTheme()` + мост `window.AndroidBridge.setTheme(dark)` (окраска системных панелей), + `tg.setHeaderColor()` для Telegram.
- Подтверждение удаления — КАСТОМНАЯ модалка (`#confirmOverlay`, `showConfirm()`/`resolveConfirm()`), НЕ `confirm()` (в WebView и Telegram не работает).
- Страница при открытых оверлеях НЕ скроллится: `body.modal-open { overflow: hidden }`, сами окна скроллятся внутри; safe-area-inset-bottom + viewport-fit=cover в telegram.
- Шрифты: в `body` добавлены эмодзи-фолбэки `Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji` (иначе iOS WebView рисует эмодзи чёрно-белыми), плюс `font-family: inherit` для button/input/select/textarea.
- Telegram: feature detection `window.Telegram?.WebApp`; тема из colorScheme (если нет сохранённой), tg.expand()/ready(), themeChanged, BackButton (при открытых оверлеях, клик = Escape), HapticFeedback при отметках.

## Порядок работы после облагораживания (31.08)

1. Правки → root files.
2. Копия в android assets + telegram (см. выше, telegram/index.html — спец-сборка).
3. Деплой Telegram — DEV: `wrangler pages deploy telegram --project-name veyo-tracker-dev --branch main` (занимает ~2 с).
3а. Деплой Telegram — ПРОД: `wrangler pages deploy telegram --project-name veyo-tracker --branch main` (занимает ~2 с). Prod ТОЛЬКО после команды пользователя «прод/деплой прод».
   DEV: https://veyo-tracker-dev.pages.dev/ — ПРОД: https://veyo-tracker.pages.dev/ (задеплоен 10.09, v0.1.1). Git-ветки: `dev` / `master`. Старые CF-проекты habit-tracker/habit-tracker-dev остались на месте (не удалять без спроса).
4. APK — ТОЛЬКО по явной просьбе пользователя: `cd android; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat assembleRelease`, далее `Copy-Item app\build\outputs\apk\release\app-release.apk -> C:\Users\user\Downloads\VeyoTracker.apk`.
5. Node-проверка: `node --check js\app.js`.

## Telegram Mini App (telegram/)

### ⚠️ СИНК v11 (09.09.2026, бот-агент) — НЕ ОТКАТЫВАТЬ
- `telegram/js/app.js` содержит **серверную синхронизацию (вариант B)**: CloudStorage-слой (`v1.*`, вариант A) УДАЛЁН и заменён на зеркало в нашем worker — `GET/POST https://veyo-reminders.okhotinandrei5.workers.dev/api/data` (KV `snap:<user_id>`, валидация initData, last-write-wins по `updatedAt` из `localStorage['habit-tracker-sync']`).
- Причина: Telegram CloudStorage НЕ работает в Telegram Desktop → на каждом устройстве был пустой кеш («новая страница»). Заказ пользователя (09.09): один аккаунт на разных устройствах должен видеть одинаковые данные.
- Поведение: localStorage = кеш/источник UI (init() сразу), cloudBoot() фоном сравнивает с сервером и применяет/заливает; cloudQueue() после save/saveStats/saveSettings/saveHistory/savePlans/toggleTheme (debounce 1.5с). Вне Telegram — чисто локально (no-op).
- 09.09 позже: фича «Цель/goal» удалена (коммит e9f8bfb) — выполнение бинарное; кнопка «Выполнено» теперь всегда. Worker v4 (5244695): кнопка с датой, чистка warn, /webhook по secret_token.
- **⚠️ Регенерация `telegram/index.html` из корневого `index.html` (процедура ниже) СБРАСЫВАЕТ версию `app.js?v=` и стирает маркер-комментарий!** После регенерации ОБЯЗАТЕЛЬНО поднять `app.js?v=11` (сейчас актуальная; root — ?v=7; иначе Telegram-клиенты отдадут закешированный старый JS) и при желании вернуть комментарий. Синк-слой CloudStorage НЕ возвращать — это зона бот-агента (bot/README.md).
- v11 (09.09): приветственное окно для новых пользователей — флаг `habit-tracker-welcome` в localStorage, добавлен в SYNC_LOCAL_KEYS (зеркало синка). Показ: нет данных и нет флага; авто-закрытие после пула данных с сервера.
- Корневой `js/app.js` синк-слоя НЕ имеет (там нет Telegram SDK) — это НЕ расхождение, не копировать туда слой. Деплой фронта DEV: `wrangler pages deploy telegram --project-name veyo-tracker-dev --branch main`.

- Развёрнуто на Cloudflare Pages (проект `veyo-tracker`): https://veyo-tracker.pages.dev/ (обновление — команда из п.3).
- wrangler установлен глобально, авторизация сохранена в `C:\Users\user\.wrangler\config\default.toml` (важна копия и в `AppData\Roaming\xdg.config\.wrangler\config\default.toml` — было несоответствие путей, из-за чего wrangler писал «Not logged in»).
- Бот: @BotFather → /newapp или /setmenubutton → URL.
- ВАЖНО: сеть ПК пользователя фильтрует TLS по SNI для *.pages.dev (DNS подменяется на приватный IP 172.22.x.x) — с этого ПК сайт НЕ открывается, это нормально. Проверять с телефона (или через webfetch, но он тоже может отдавать Transport error — не путать с реальной ошибкой деплоя).

## Android (android/)

- Kotlin, minSdk 26, targetSdk 35, AGP 8.7.3, Gradle 8.9 (wrapper), Kotlin 2.0.21, Java 17 (JBR из Android Studio).
- Без внешних зависимостей.
- Кнопка «Назад» закрывает модалки (диспатч Escape в JS: modalOverlay, confirmOverlay, periodInputOverlay — проверить функцию в MainActivity).
- Release-сборка подписана debug-ключом. Готовый APK лежит в `C:\Users\user\Downloads\VeyoTracker.apk`.
- Пользователь поставил правило: APK собирать ТОЛЬКО по явной просьбе.

## Git / GitHub

- Основной репо: https://github.com/soranocode/veyo-tracker (приватный, переименован 02.09 из habit-tracker), remote `origin`.
- GitHub CLI установлен и авторизован (доступен через `$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')` в сессии PowerShell).
- `.gitignore` исключает сборки, local.properties, .idea, APK.

### Модель веток (настроено 02.09)

- `master` — стабильная ветка: актуальный рабочий код, тянет за собой только релизы. Деплой ПРОД из master (wrangler pages deploy с branch master).
- `dev` — линия разработки: сюда вливается вся обычная работа. Деплой DEV из dev (wrangler pages deploy ... --branch main — фактически dev).
- Фичи и патчи — отдельные ветки от актуальной `dev`: `feat/*` (новая функциональность), `fix/*` (исправления). Вливаются обратно в `dev` через merge (коммит-сообщение в стиле проекта, пуш ветки удаляется).
- Релиз (см. также «Релизный процесс» ниже): слияние `dev` → `master` (сначала проверить `git diff dev..master`), затем тег `vX.Y.Z` на master.

### Теги версий

- Формат: `v<major>.<minor>.<patch>` (напр. `v1.0.0`). Аннотированный тег: `git tag -a v1.0.0 -m "..."`.
- Тег ставится в момент релиза (сборка APK/деплой ПРОД) на `master` — точка архивации состояния.
- Текущий последний тег: `v1.0.0` (первый стабильный релиз, 02.09).
- Пуш тегов: `git push origin master && git push origin v1.0.0` (v1.0.1/... по образцу).

### Релизный процесс (чек-лист)

1. Разработка: ветка `feat/*` или `fix/*` от `dev` → merge в `dev`.
2. Проверки: `node --check js\app.js`, тест в DEV-деплое (veyo-tracker-dev): `wrangler pages deploy telegram --project-name veyo-tracker-dev --branch main`.
3. Смержить dev в master: на dev → `git checkout master && git merge --ff-only dev` (если не FF — сначала merge-коммит или rebase dev на master).
4. `git tag -a v<новый номер> -m "<описание>"` на master, `git push origin master && git push origin v<тег>`.
5. ПРОД-деплой: `wrangler pages deploy telegram --project-name veyo-tracker --branch main` — ТОЛЬКО после команды пользователя «прод/деплой прод».

## Окружение машины

- Windows, PowerShell 5.1. Java 17. Android Studio: `C:\Program Files\Android\Android Studio` (JBR = JAVA_HOME для сборки).
- SDK: `C:\Users\user\AppData\Local\Android\Sdk` (platforms 34/35, build-tools 34.0.0). `node` есть (для `node --check`).
- `node --check` запускать из корня проекта.
- Эмулятор: AVD `Test_API_31` есть, но НЕ запускать без просьбы (у пользователя был конфликт «more than one device»).
- Телефон подключается по adb как `lfaaxk8tkf5t8hzt` — иногда не подключён.

## Telegram-бот и напоминания (ЗОНА БОТ-АГЕНТА, с 02.09.2026)

- Каталог `bot/` закреплён за бот-агентом (OpenClaw). Кодеру фронта НЕ редактировать `bot/` без команды пользователя. Подробности и статус: `bot/README.md`.
- Архитектура напоминаний: Mini App (ПРОД: veyo-tracker.pages.dev, dev: veyo-tracker-dev.pages.dev) шлёт задачи с `reminderTime` в Cloudflare Worker `veyo-reminders` (POST /api/sync → KV `VEYO_KV`, авторизация по initData) → cron раз в минуту шлёт через Telegram Bot API `sendMessage` на chat_id (webhook копит `chat:<user_id>`).
- Локальный long polling-бот на grammY (`bot/index.js`) — LEGACY, остановлен. Бот живёт в Worker через webhook.
- Веб-патч синхронизации (`syncRemindersToBackend()` в корневом `js/app.js`, вызывается из `save()` и `init()`) — часть эпика напоминаний; синк копий — по процедуре выше.
- Telegram-бот `@veyo_tracker_bot`: на `/start` в личке — приветствие с кнопкой «Открыть Veyo Tracker» (ведёт на ПРОД, worker v8); на прочие сообщения молчит. Menu Button бота переключён на ПРОД (10.09).
- Worker v8 (10.09): ручная рассылка анонсов обновлений всем, кто писал боту — `POST /admin/broadcast` `{version, notes, force?}` (заголовок `X-Admin-Secret` = WEBHOOK_SECRET); шлётся только по команде пользователя. Плюс `POST /admin/setmenubutton` (Menu Button → URL мини-аппа).
