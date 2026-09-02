// Veyo Tracker — Telegram bot (режим «только плашка»)
// Запуск: npm start (long polling). Токен и URL — в bot/.env (в git НЕ коммитится).
// Библиотека: grammY (https://grammy.dev)
//
// Поведение: бот НЕ отвечает на сообщения (диалога нет).
// Вся задача бота — держать Menu Button «Открыть Veyo Tracker» (кнопка-плашка слева от поля ввода),
// которая открывает мини-приложение. Поле ввода убрать в личке Telegram не даёт — бот просто молчит.

const { Bot } = require("grammy");

const token = process.env.BOT_TOKEN;
const appUrl = process.env.APP_URL || "https://veyo-tracker-dev.pages.dev";

if (!token) {
  console.error("[FATAL] BOT_TOKEN не задан. Проверь bot/.env");
  process.exit(1);
}

const bot = new Bot(token);

// --- Menu Button: плашка «Открыть Veyo Tracker» слева от поля ввода (для всех) ---
bot.api
  .setChatMenuButton({
    menu_button: {
      type: "web_app",
      text: "Открыть Veyo Tracker",
      web_app: { url: appUrl },
    },
  })
  .then(() => console.log("[OK] Menu Button установлена"))
  .catch((err) => console.error("[WARN] Menu Button не установилась:", err.message));

// --- Ошибки: логируем, но молчим пользователю ---
bot.catch((err) => {
  console.error("[ERROR]", err.error ?? err);
});

// --- Запуск (long polling — держим соединение, чтобы Menu Button не пропала) ---
bot.start();
console.log(`[OK] Бот @veyo_tracker_bot в режиме «только плашка». Mini App: ${appUrl}`);
