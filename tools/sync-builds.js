/**
 * Раскладывает корневые index.html / css / js по сборкам:
 *   android/app/src/main/assets — прямые копии;
 *   telegram/ — index.html со вставкой Telegram SDK, app.js с сохранением слоя серверной синхронизации.
 *
 * Слой синхронизации (зона бот-агента) НЕ хранится в скрипте: он вырезается из текущего
 * telegram/js/app.js по маркеру и приклеивается к свежему корневому app.js. Так редизайн
 * фронта не затирает синк, а синк не приходится дублировать в двух файлах.
 *
 * Запуск из корня проекта: node tools/sync-builds.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SYNC_MARKER = '// ===================== Серверная синхронизация';
const ROOT_TAIL = "    document.addEventListener('DOMContentLoaded', init);\n})();";

// в репозитории файлы с CRLF: внутри работаем с \n, наружу пишем как было
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const toCrlf = (text) => text.replace(/\n/g, '\r\n');
const write = (p, text) => {
    const full = path.join(ROOT, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, toCrlf(text), { encoding: 'utf8' }); // без BOM, иначе ломается кириллица
};

function fail(message) {
    console.error('ОШИБКА: ' + message);
    process.exit(1);
}

/** Корневой app.js + слой синхронизации из текущей telegram-версии. */
function buildTelegramApp(rootApp, currentTgApp) {
    const markerAt = currentTgApp.indexOf(SYNC_MARKER);
    if (markerAt < 0) fail('в telegram/js/app.js не найден слой синхронизации — синк оборвётся, сборка остановлена');

    const layer = currentTgApp.slice(markerAt).trimEnd();
    if (!layer.includes('cloudBoot')) fail('слой синхронизации найден, но в нём нет cloudBoot — проверь telegram/js/app.js');
    if (!rootApp.includes(ROOT_TAIL)) fail('в корневом app.js не найден хвост с DOMContentLoaded — обнови ROOT_TAIL в скрипте');

    // точки сохранения состояния, которые слой зеркалит на сервер
    const queueAfter = [
        ['localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));', 'STORAGE_KEY'],
        ["localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');", 'THEME_KEY'],
        ['localStorage.setItem(STATS_KEY, JSON.stringify(stats));', 'STATS_KEY'],
        ['localStorage.setItem(SETTINGS_KEY, JSON.stringify({}));', 'SETTINGS_KEY'],
        ['localStorage.setItem(HISTORY_KEY, JSON.stringify(history));', 'HISTORY_KEY'],
        ['localStorage.setItem(PLANS_KEY, JSON.stringify(plans));', 'PLANS_KEY']
    ];

    let out = rootApp;
    queueAfter.forEach(([line, key]) => {
        if (!out.includes(line)) fail(`в корневом app.js нет строки «${line}» — некуда вставить cloudQueue(${key})`);
        out = out.split(line).join(`${line}\n${' '.repeat(0)}CLOUDQUEUE(${key});`);
    });

    // восстановить отступ вставленных вызовов по отступу строки, за которой они идут
    out = out.replace(/^([ \t]*)(.*)\nCLOUDQUEUE\((\w+)\);$/gm, (_, indent, line, key) => `${indent}${line}\n${indent}cloudQueue(${key});`);

    // в боте эмодзи задачи не подменяем колокольчиком — уведомление рисует его само
    out = out.replace("emoji: h.emoji || '🔔',", "emoji: h.emoji || '',");

    // отметки «выполнено», нажатые в чате бота, подтягиваем сразу на старте
    out = out.replace(
        '        purgeDonePeriodlessHabits();\n',
        '        purgeDonePeriodlessHabits();\n        fetchState(); // подтянуть отметки «выполнено» из бота (кнопка в Telegram) и смержить\n'
    );

    return out.replace(ROOT_TAIL, '    ' + layer) + '\n';
}

/** Корневой index.html + вьюпорт и SDK Telegram; версия app.js растёт при изменении кода. */
function buildTelegramHtml(rootHtml, currentTgHtml, appChanged) {
    let html = rootHtml.replace(
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">'
    );
    if (!html.includes('telegram-web-app.js')) {
        html = html.replace('</head>', '    <script src="https://telegram.org/js/telegram-web-app.js"></script>\n</head>');
    }

    const currentVersion = parseInt((/js\/app\.js\?v=(\d+)/.exec(currentTgHtml) || [])[1], 10) || 0;
    const nextVersion = appChanged ? currentVersion + 1 : currentVersion;
    html = html.replace(/js\/app\.js\?v=\d+/, `js/app.js?v=${nextVersion}`);
    return { html, version: nextVersion, bumped: appChanged };
}

const rootHtml = read('index.html');
const rootCss = read('css/style.css');
const rootApp = read('js/app.js');

// --- Android: прямые копии ---
const ANDROID = 'android/app/src/main/assets';
write(`${ANDROID}/index.html`, rootHtml);
write(`${ANDROID}/css/style.css`, rootCss);
write(`${ANDROID}/js/app.js`, rootApp);

// --- Telegram ---
const tgApp = buildTelegramApp(rootApp, read('telegram/js/app.js'));
const appChanged = tgApp !== read('telegram/js/app.js');
write('telegram/js/app.js', tgApp);
write('telegram/css/style.css', rootCss);

const { html, version, bumped } = buildTelegramHtml(rootHtml, read('telegram/index.html'), appChanged);
write('telegram/index.html', html);

console.log('android/assets — обновлены (index.html, css, js)');
console.log(`telegram/js/app.js — пересобран, слой синхронизации на месте (${(tgApp.match(/cloudQueue\(/g) || []).length} вызовов cloudQueue)`);
console.log(`telegram/index.html — SDK на месте, app.js?v=${version}${bumped ? ' (поднята)' : ' (без изменений)'}`);
