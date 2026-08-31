# AGENTS.md — контекст проекта Habit Tracker

Прочитай этот файл целиком перед работой над проектом. Он содержит всё, что сделано и как устроен проект.

## Что это за проект

Приложение «Habit Tracker» — трекер привычек с планированием вперёд:
- привычка создаётся на выбранный период (1–4 недели / 1–3 месяца);
- вместо истории показывается «План на период» — лента дней от начала периода до конца, клик по дню отмечает выполнение;
- статистика: серия дней, выполнено сегодня, всего выполнено, прогресс периода.

## Структура

```
habit-tracker/
├── index.html          # веб-версия (источник правды для UI)
├── css/style.css       # стили (светлая/тёмная тема через data-theme)
├── js/app.js           # вся логика (vanilla JS, IIFE)
├── telegram/           # версия для Telegram Mini App (копия веб-версии + SDK)
│   ├── index.html      # отличается: script telegram-web-app.js в <head>
│   ├── css/style.css   # копия корневого
│   └── js/app.js       # копия корневого
└── android/            # проект Android Studio (WebView-обёртка)
    ├── app/src/main/java/com/habittracker/app/MainActivity.kt
    ├── app/src/main/assets/          # КОПИЯ веб-файлов (index.html, css/, js/)
    └── app/src/main/res/             # темы, строки, иконка
```

**ВАЖНО**: правки UI/логики делаются в корневых файлах (index.html, css/style.css, js/app.js),
затем копируются в `android/app/src/main/assets/` и пересобирается APK:
```powershell
Copy-Item index.html, css\style.css, js\app.js -> android\app\src\main\assets\...
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
cd android; .\gradlew.bat assembleRelease
```

## Ключевая логика (js/app.js)

- Хранение: `localStorage` ключи `habit-tracker-data` (JSON массива привычек), `habit-tracker-theme`.
- Модель привычки: `{ id, name, emoji, goal (раз в день), color, periodDays, startDate, completions: { 'YYYY-MM-DD': count }, createdAt }`.
- Даты ТОЛЬКО локальные (`localDateStr`), не `toISOString()` (был баг со сдвигом дня).
- Период: `endDateOf(habit)` = startDate + periodDays - 1. Отмечать можно любой день внутри периода (в т.ч. будущие — планирование).
- Кнопка «+» в карточке и клик по ячейке плана: инкремент до goal; при выполнении клик отменяет последний шаг (не обнуляет всё).
- Кастомный эмодзи: поле `#customEmoji` в модалке; `getSelectedEmoji()` отдаёт кастомный приоритетно; `normalizeEmoji()` фильтрует не-эмодзи (Unicode \p{Extended_Pictographic}).
- Серия дней: если сегодня не всё выполнено, серия считается со вчера (не обнуляется).
- Прогресс периода: выполненные дни / суммарные дни периодов.
- Тема: `applyTheme()` + мост `window.AndroidBridge.setTheme(dark)` для окраски системных панелей (в браузере игнорируется).
- Подтверждение удаления — КАСТОМНАЯ модалка (`#confirmOverlay`, `showConfirm()`/`resolveConfirm()`), не `confirm()` (в WebView и Telegram не работает).
- Telegram: `const tg = window.Telegram?.WebApp` — feature detection. В telegram/index.html подключается SDK. Логика: тема из `tg.colorScheme` (если нет сохранённой), `tg.expand()/ready()`, `themeChanged`, BackButton (показывается при открытых оверлеях, клик = Escape), `tg.HapticFeedback` при отметках, `setHeaderColor` под тему.

## Telegram Mini App (telegram/)

- Папка `telegram/` = веб-версия + SDK-скрипт в <head>. Синхронизировать после правок корневых файлов:
  `Copy-Item css\style.css telegram\css\ ; Copy-Item js\app.js telegram\js\` (index.html править вручную — там SDK-тег).
- Для работы нужен HTTPS-хостинг (требование Telegram): GitHub Pages (репо приватное — Pages платный, нужен публичный репо или Pro), Cloudflare Pages, Vercel.
- Бот: @BotFather → /newapp (или /setmenubutton) → указать URL развёрнутого telegram/index.html.
- **Развёрнуто на Cloudflare Pages** (проект `habit-tracker`, wrangler установлен глобально и авторизован, конфиг токена в `~/.wrangler/config/default.toml`):
  URL приложения: `https://habit-tracker-de1.pages.dev/`
  Обновление деплоя: `wrangler pages deploy telegram --project-name habit-tracker --branch main`
- ВАЖНО: сеть ПК пользователя фильтрует TLS по SNI для *.pages.dev (DNS подменяется) — с этого ПК сайт не открывается, это нормально; проверять с телефона.

## Android (android/)

- Kotlin, minSdk 26, targetSdk 35, AGP 8.7.3, Gradle 8.9 (wrapper), Kotlin 2.0.21, Java 17 (JBR из Android Studio).
- Без внешних зависимостей (чистый Activity + WebView).
- Кнопка «Назад» закрывает модалку (диспатч Escape в JS), иначе выход.
- Release-сборка подписана debug-ключом (для установки без Play Store).
- Готовый APK: `C:\Users\user\Downloads\HabitTracker.apk` и `android\app\build\outputs\apk\release\app-release.apk`.

## Git / GitHub

- Репозиторий: https://github.com/soranocode/habit-tracker (приватный), ветка `master`, remote `origin`.
- `.gitignore` исключает сборки, local.properties, .idea, APK.
- GitHub CLI установлен и авторизован. Пуш: `git add . ; git commit -m "..." ; git push`.

## Окружение машины

- Windows, PowerShell 5.1. Java 17. Android Studio: `C:\Program Files\Android\Android Studio`.
- SDK: `C:\Users\user\AppData\Local\Android\Sdk` (platforms 34/35, build-tools 34.0.0). `node` есть (для `node --check js/app.js`).
- Телефон пользователя подключается по adb как `lfaaxk8tkf5t8hzt`.
