# AGENTS.md — контекст проекта Task Tracker

Прочитай этот файл целиком перед работой над проектом. Он содержит всё, что сделано и как устроен проект.
Обновлено: 31 августа 2026 г.

## Что это за проект

Приложение «Habit Tracker» (бренд) — трекер задач с планированием вперёд. ВАЖНО: в UI используется слово «ЗАДАЧА», не «привычка» — пользователь просил, чтобы везде был термин «задача»:
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
    ├── app/src/main/java/com/habittracker/app/MainActivity.kt
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
- Модель задачи: `{ id, name, emoji, goal (раз в день), color, periodDays, startDate: string|off, completions: { 'YYYY-MM-DD': count }, lifetimeCount, createdAt }`.
- Статистика: постоянные счётчики `habit-tracker-stats` = { total, today, todayDate }: `stats.total` («Всего выполнено») увеличивается при каждом полностью выполненном дне задачи, НЕ сбрасывается удалением задач из главного меню; `stats.today` («Сегодня») обнуляется ТОЛЬКО при наступлении нового дня (todayDate !== today на init). Удаление записи ИЗ ИСТОРИИ уменьшает счётчики на 1 (total всегда, today если запись была сегодня); уменьшение счётчиков также происходит при отмене выполнения (3/3→0), пока запись ещё в истории. Удаление задач из главного списка счётчики и серию дней НЕ прерывает.
- Задачи БЕЗ периода: `periodDays: null` (тоггл «Без периода» в модалке). Висит как задача (нет строки в «Плане на период», нет «% за период», не влияет на серию дней). При выполнении удаляется на следующий день (purge на init), но счётчик выполнений сохраняется: `habit.lifetimeCount` (карточка «выполнено всего: N»); глобальные счётчики лежат в stats (см. выше).
- Планы: период плана НЕ влияет на % задач — % задачи = полностью выполненные дни / собственный период задачи (дефолт 30, если нет); % плана = среднее арифметическое % задач.
- Даты ТОЛЬКО локальные (`localDateStr`), не `toISOString()` (был баг со сдвигом дня).
- Период: `endDateOf(habit)` = startDate + periodDays - 1. Отмечать можно любой день внутри периода (в т.ч. будущие — планирование).
- Кнопка «+» в карточке и клик по ячейке плана: инкремент до goal; при достижении goal следующий клик обнуляет в 0 (карусель: 0→1→2→3→0).

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
- Список пресет-иконок в модалке: 💧 🏃 📚 🏋️ 💤 🍎 💊 🧹 🚶 🎯 🚬 📺 (🏋️ вместо 🧘, добавлены 🚬 📺).

### Прочее
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
3. Деплой Telegram: `wrangler pages deploy telegram --project-name habit-tracker --branch main` (занимает ~2 с).
4. APK — ТОЛЬКО по явной просьбе пользователя: `cd android; $env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'; .\gradlew.bat assembleRelease`, далее `Copy-Item app\build\outputs\apk\release\app-release.apk -> C:\Users\user\Downloads\HabitTracker.apk`.
5. Node-проверка: `node --check js\app.js`.

## Telegram Mini App (telegram/)

- Развёрнуто на Cloudflare Pages (проект `habit-tracker`): https://habit-tracker-de1.pages.dev/ (обновление — команда из п.3).
- wrangler установлен глобально, авторизация сохранена в `C:\Users\user\.wrangler\config\default.toml` (важна копия и в `AppData\Roaming\xdg.config\.wrangler\config\default.toml` — было несоответствие путей, из-за чего wrangler писал «Not logged in»).
- Бот: @BotFather → /newapp или /setmenubutton → URL.
- ВАЖНО: сеть ПК пользователя фильтрует TLS по SNI для *.pages.dev (DNS подменяется на приватный IP 172.22.x.x) — с этого ПК сайт НЕ открывается, это нормально. Проверять с телефона (или через webfetch, но он тоже может отдавать Transport error — не путать с реальной ошибкой деплоя).

## Android (android/)

- Kotlin, minSdk 26, targetSdk 35, AGP 8.7.3, Gradle 8.9 (wrapper), Kotlin 2.0.21, Java 17 (JBR из Android Studio).
- Без внешних зависимостей.
- Кнопка «Назад» закрывает модалки (диспатч Escape в JS: modalOverlay, confirmOverlay, periodInputOverlay — проверить функцию в MainActivity).
- Release-сборка подписана debug-ключом. Готовый APK лежит в `C:\Users\user\Downloads\HabitTracker.apk`.
- Пользователь поставил правило: APK собирать ТОЛЬКО по явной просьбе.

## Git / GitHub

- Основной репо: https://github.com/soranocode/habit-tracker (приватный), ветка `master`, remote `origin`.
- Доп. репо (копия проекта): https://github.com/soranocode/habits_telegram (приватный), remote `tg` (создан 31.08 gh CLI).
- НЕЗАКОММИЧЕНО (на 31.08 вечер): весь текущий рефактор (период, слайдер, эмодзи, задачи). Перед работой — проверить `git status`, при необходимости закоммитить запушенное.
- GitHub CLI установлен и авторизован (доступен через `$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')` в сессии PowerShell).
- `.gitignore` исключает сборки, local.properties, .idea, APK.

## Окружение машины

- Windows, PowerShell 5.1. Java 17. Android Studio: `C:\Program Files\Android\Android Studio` (JBR = JAVA_HOME для сборки).
- SDK: `C:\Users\user\AppData\Local\Android\Sdk` (platforms 34/35, build-tools 34.0.0). `node` есть (для `node --check`).
- `node --check` запускать из корня проекта.
- Эмулятор: AVD `Test_API_31` есть, но НЕ запускать без просьбы (у пользователя был конфликт «more than one device»).
- Телефон подключается по adb как `lfaaxk8tkf5t8hzt` — иногда не подключён.
