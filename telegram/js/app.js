(() => {
    'use strict';

    const STORAGE_KEY = 'habit-tracker-data';
    const THEME_KEY = 'habit-tracker-theme';
    const PLANS_KEY = 'habit-tracker-plans';
    const LIFETIME_KEY = 'habit-tracker-lifetime';
    const HISTORY_KEY = 'habit-tracker-history';
    const SETTINGS_KEY = 'habit-tracker-settings';
    const WELCOME_KEY = 'habit-tracker-welcome';

    const DEFAULT_PERIOD = 30;

    const PERIOD_STEPS = [1, 2, 3, 4, 5, 6, 7, 14, 21, 28, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 360];

    function nearestStep(value) {
        return PERIOD_STEPS.reduce((best, s) =>
            Math.abs(s - value) < Math.abs(best - value) ? s : best, PERIOD_STEPS[0]);
    }

    function pluralDays(n, one, few, many) {
        const abs = Math.abs(n) % 100;
        const d = abs % 10;
        if (abs > 10 && abs < 20) return n + ' ' + many;
        if (d > 1 && d < 5) return n + ' ' + few;
        if (d === 1) return n + ' ' + one;
        return n + ' ' + many;
    }

    function formatPeriod(days) {
        days = parseInt(days, 10) || 0;
        if (days <= 6) return pluralDays(days, 'день', 'дня', 'дней');
        if (days < 30) return pluralDays(days, 'день', 'дня', 'дней');
        
        // Стандартные периоды
        if (days === 30) return pluralDays(1, 'месяц', 'месяца', 'месяцев');
        if (days === 60) return pluralDays(2, 'месяц', 'месяца', 'месяцев');
        if (days === 90) return pluralDays(3, 'месяц', 'месяца', 'месяцев');
        if (days === 180) return pluralDays(6, 'месяц', 'месяца', 'месяцев');
        if (days === 365) return pluralDays(12, 'месяц', 'месяца', 'месяцев');
        
        const months = Math.floor(days / 30);
        const rest = days % 30;
        let parts = [];
        if (months > 0) parts.push(pluralDays(months, 'месяц', 'месяца', 'месяцев'));
        if (rest > 0) {
            const weeks = Math.floor(rest / 7);
            const d = rest % 7;
            if (weeks > 0) parts.push(pluralDays(weeks, 'неделя', 'недели', 'недель'));
            if (d > 0) parts.push(pluralDays(d, 'день', 'дня', 'дней'));
        }
        return parts.join(' ');
    }

    function formatPeriodFromDate(days, startDate) {
        days = parseInt(days, 10) || 0;
        if (days <= 6) return pluralDays(days, 'день', 'дня', 'дней');
        if (days < 30) return pluralDays(days, 'день', 'дня', 'дней');
        
        // Специальный случай: 365 дней = 1 год = 12 месяцев (без дней)
        if (days === 365) return pluralDays(12, 'месяц', 'месяца', 'месяцев');

        // Разбор стартовой даты
        const [year, month, day] = startDate.split('-').map(Number);
        let remaining = days;
        let months_count = 0;
        let current_year = year;
        let current_month = month;

        // Считаем полные месяцы от начальной даты
        while (remaining > 0) {
            // Получить количество дней в текущем месяце (от текущего дня)
            const daysInCurrentMonth = new Date(current_year, current_month, 0).getDate();
            const daysLeftInMonth = daysInCurrentMonth - day + 1;

            if (remaining >= daysLeftInMonth) {
                remaining -= daysLeftInMonth;
                months_count++;
                // Переходим на следующий месяц
                current_month++;
                if (current_month > 12) {
                    current_month = 1;
                    current_year++;
                }
            } else {
                break;
            }
        }

        let parts = [];
        if (months_count > 0) parts.push(pluralDays(months_count, 'месяц', 'месяца', 'месяцев'));
        if (remaining > 0) {
            const weeks = Math.floor(remaining / 7);
            const d = remaining % 7;
            if (weeks > 0) parts.push(pluralDays(weeks, 'неделя', 'недели', 'недель'));
            if (d > 0) parts.push(pluralDays(d, 'день', 'дня', 'дней'));
        }
        return parts.join(' ');
    }

    const EMOJI_DEFAULTS = {
        // Вода и напитки
        '💧': 'Выпить воды',
        '☕': 'Выпить кофе',
        '🍵': 'Выпить чай',
        '🥤': 'Меньше газировки',
        // Еда
        '🍎': 'Поесть',
        '🥗': 'Салат / правильное питание',
        '🥦': 'Здоровое питание',
        '🍳': 'Приготовить еду',
        '🍫': 'Меньше сладкого',
        '🍟': 'Меньше фастфуда',
        // Здоровье и уход
        '💊': 'Принять таблетку',
        '🦷': 'Чистить зубы',
        '🧼': 'Мыть руки',
        '🩺': 'Записаться к врачу',
        '🧴': 'Уход за кожей',
        '🛁': 'Принять ванну',
        '🚿': 'Душ',
        '💤': 'Сон',
        '🛌': 'Ранний сон',
        '🌅': 'Ранний подъём',
        // Спорт и движение
        '🏋️': 'Спорт',
        '💪': 'Силовые тренировки',
        '🏃': 'Пробежка',
        '🚶': 'Прогулка',
        '🏊': 'Плавание',
        '🚴': 'Велосипед',
        '⚽': 'Футбол',
        '🏀': 'Баскетбол',
        '🎾': 'Теннис',
        '🧗': 'Скалолазание',
        '🧘': 'Медитация',
        '🧘‍♀️': 'Йога',
        '🤸': 'Растяжка',
        // Учёба и развитие
        '📚': 'Прочитать',
        '📖': 'Чтение книги',
        '📝': 'Планирование',
        '✍️': 'Написать тексты',
        '🗣️': 'Практика речи',
        '🧠': 'Учить новое',
        '🎓': 'Учёба / курсы',
        '💻': 'Работа за компьютером',
        '📱': 'Меньше телефона',
        '🎧': 'Подкаст / аудиокнига',
        '⏰': 'Таймер / Помодоро',
        '🇬🇧': 'Английский язык',
        '🇪🇸': 'Испанский язык',
        // Дом и быт
        '🧹': 'Уборка',
        '🧺': 'Постирать',
        '🗑️': 'Вынести мусор',
        '🧽': 'Помыть посуду',
        '🛒': 'Сходить в магазин',
        '🧾': 'Планировать покупки',
        '🌱': 'Полить растения',
        // Деньги
        '💰': 'Отложить деньги',
        '📊': 'Учёт финансов',
        // Отношения, отдых, хобби
        '🤝': 'Встретиться с другом',
        '📞': 'Позвонить близким',
        '👨‍👩‍👧‍👦': 'Время с семьёй',
        '💌': 'Написать близким',
        '🎁': 'Сделать подарок',
        '🎯': 'Работа над целью',
        '📅': 'Запланировать день',
        '🎮': 'Время игр',
        '🎲': 'Настольные игры',
        '🎨': 'Творчество',
        '🎸': 'Игра на гитаре',
        '🎹': 'Игра на пианино',
        '📸': 'Фотография',
        '🧩': 'Головоломка',
        '🧸': 'Уход за питомцем',
        '🐕': 'Выгул собаки',
        '🐈': 'Уход за котом',
        '🌿': 'Время на природе',
        '🌲': 'Прогулка в лесу',
        '🏞️': 'Поход в горы',
        '🏖️': 'Отдых на море',
        '🥳': 'Отметить праздник',
        '🙏': 'Благодарность',
        '🚬': 'Бросить курить',
        '📺': 'Норма телевизора',
        '✈️': 'Путешествие'
    };

    let habits = [];
    let plans = [];
    let editingId = null;
    let reminderTimeCurrent = null;
    let reminderTimeDraft = '09:00';
    let editingPlanId = null;
    let editingItemId = null;
    let itemTargetPlanId = null;
    let planUserEditedName = false;
    let itemUserEditedName = false;
    let activeTab = 'habits';
    let movingHabitId = null;
    let moveOverlayScrollY = null;
    let lifetimeTotal = 0;
    let stats = { total: 0, today: 0, todayDate: '' };
    let history = [];
    let toastTimer = null;
    let confirmResolver = null;
    let userEditedName = false;

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const tg = window.Telegram ? window.Telegram.WebApp : null;

    function localDateStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    function today() {
        return localDateStr(new Date());
    }

    function addDays(dateStr, n) {
        const d = new Date(dateStr + 'T00:00:00');
        d.setDate(d.getDate() + n);
        return localDateStr(d);
    }

    function diffDays(fromStr, toStr) {
        const a = new Date(fromStr + 'T00:00:00');
        const b = new Date(toStr + 'T00:00:00');
        return Math.round((b - a) / 86400000);
    }

    function endDateOf(habit) {
        if (habit.periodDays === null) return null;
        return addDays(habit.startDate, habit.periodDays - 1);
    }

    function isPeriodless(habit) {
        return habit.periodDays === null;
    }

    function formatShort(dateStr) {
        return new Date(dateStr + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    }

    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    function load() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            habits = raw ? JSON.parse(raw) : [];
        } catch {
            habits = [];
        }

        habits = habits.filter(h =>
            h && typeof h === 'object' &&
            typeof h.id === 'string' &&
            typeof h.name === 'string' &&
            h.name.trim() !== ''
        );

        habits.forEach(h => {
            h.periodDays = (h.periodDays === null || h.periodDays === undefined || h.periodDays === '')
                ? null
                : Math.min(Math.max(parseInt(h.periodDays, 10) || DEFAULT_PERIOD, 1), 365);
            if (typeof h.completions !== 'object' || h.completions === null || Array.isArray(h.completions)) {
                h.completions = {};
            }
            if (typeof h.lifetimeCount !== 'number' || h.lifetimeCount < 0) h.lifetimeCount = 0;
            if (h.emoji == null) h.emoji = '';
            if (!h.color) h.color = '#22a2f0';
            if (!h.startDate) h.startDate = h.createdAt || today();
        });
    }

    function loadLifetime() {
        try {
            lifetimeTotal = parseInt(localStorage.getItem(LIFETIME_KEY), 10) || 0;
        } catch {
            lifetimeTotal = 0;
        }
    }

    // Задачи без периода: если выполнена (в любой прошедший день) — удалить.
    // Счётчики stats при этом сохраняются (накопительный эффект).
    function purgeDonePeriodlessHabits() {
        const t = today();
        const before = habits.length;
        habits = habits.filter(h => {
            if (!isPeriodless(h)) return true;
            return !Object.keys(h.completions || {}).some(d => {
                return d < t && (h.completions[d] || 0) > 0;
            });
        });
        if (habits.length !== before) save();
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
        cloudQueue(STORAGE_KEY);
        syncRemindersToBackend();
    }

    // ---- Синхронизация напоминаний с бэкендом (Cloudflare Worker veyo-reminders) ----
    // Шлёт снапшот задач с напоминаниями, чтобы Worker-бот мог доставлять push.
    // Только из Telegram Mini App (нужен initData), fire-and-forget, дебаунс 10 с.
    const SYNC_ENDPOINT = 'https://veyo-reminders.okhotinandrei5.workers.dev/api/sync';
    const STATE_ENDPOINT = 'https://veyo-reminders.okhotinandrei5.workers.dev/api/state';
    let lastReminderSyncAt = 0;

    function syncRemindersToBackend() {
        if (!tg || !tg.initData) return; // вне Telegram — синк не нужен

        const t = today();
        let tz = 'UTC';
        try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { /* остаёмся на UTC */ }

        const tasks = habits.map(h => {
            const end = endDateOf(h);
            const started = !h.startDate || t >= h.startDate;
            const overdue = !!(end && t > end);
            const doneToday = (h.completions[t] || 0) > 0;
            return {
                id: h.id,
                name: h.name,
                emoji: h.emoji || '',
                color: h.color,
                doneToday,
                reminderTime: h.reminderTime,
                active: started && !overdue && !doneToday
            };
        });

        const nowMs = Date.now();
        if (nowMs - lastReminderSyncAt < 10000) return;
        lastReminderSyncAt = nowMs;

        const payload = {
            initData: tg.initData,
            tz,
            tasks
        };

        fetch(SYNC_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).catch(() => { /* бэкенд недоступен — не критично для UI */ });
    }

    function fetchState() {
        if (!tg || !tg.initData) return; // вне Telegram — нечего мержить

        fetch(`${STATE_ENDPOINT}?initData=${encodeURIComponent(tg.initData)}`)
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data || !data.tasks) return;
                let changed = false;
                data.tasks.forEach(remote => {
                    const habit = habits.find(h => h.id === remote.id);
                    if (!habit) return;
                    if (remote.doneToday && !isCompletedToday(habit)) {
                        const t = today();
                        toggleHabitOnDate(habit, t);
                        logCompletion(habit, habit, t, false, true);
                        habit.lifetimeCount = (habit.lifetimeCount || 0) + 1;
                        changed = true;
                    }
                });
                if (changed) {
                    save();
                    saveHistory();
                    saveStats();
                    renderHabits();
                    renderPlan();
                }
            })
            .catch(() => { /* бэкенд недоступен — не критично */ });
    }

    function pld(n) {
        return pluralDays(n, 'день', 'дня', 'дней');
    }

    function formatDate(d) {
        const months = [
            'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
            'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
        ];
        const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
        return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
    }

    function showToast(message) {
        let toast = $('#toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toast';
            toast.setAttribute('role', 'status');
            document.body.appendChild(toast);
        }
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }

    function applyTheme(dark) {
        if (dark) {
            document.documentElement.setAttribute('data-theme', 'dark');
            $('#themeToggle').textContent = '☀️';
            $('#themeToggle').title = 'Включить светлую тему';
        } else {
            document.documentElement.removeAttribute('data-theme');
            $('#themeToggle').textContent = '🌙';
            $('#themeToggle').title = 'Включить тёмную тему';
        }

        if (window.AndroidBridge && window.AndroidBridge.setTheme) {
            try {
                window.AndroidBridge.setTheme(dark);
            } catch {
                /* работаем без моста (обычный браузер) */
            }
        }

        if (tg && tg.setHeaderColor) {
            try {
                tg.setHeaderColor(dark ? '#13233d' : '#e9f6fe');
            } catch {
                /* нет поддержки setHeaderColor */
            }
        }
    }

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        let dark;
        if (saved) {
            dark = saved === 'dark';
        } else if (tg) {
            dark = tg.colorScheme === 'dark';
        } else {
            dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        }
        applyTheme(dark);
    }

    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
        cloudQueue(THEME_KEY);
        applyTheme(!isDark);
    }

    function getHabitCount(habit, date) {
        if (!habit.completions) return 0;
        return habit.completions[date] || 0;
    }

    function isCompletedToday(habit) {
        return getHabitCount(habit, today()) > 0;
    }

    // Серия дней считается по истории выполнений:
    // — день засчитывается при ПЕРВОМ выполненном задачами (любой задачи) за день;
    // — удаление записей из истории прерывает серию (нет записей за день — день не считается);
    // — удаление задач из главного меню серию не рвёт (записи в истории остаются).
    function calculateStreak() {
        if (history.length === 0) return 0;

        const daysWithEntries = new Set(history.map(h => h.date));
        let streak = 0;
        const d = new Date();

        // Сегодня ещё не выполнено — серия ведётся со вчера (сегодня не засчитан)
        if (!daysWithEntries.has(localDateStr(d))) {
            d.setDate(d.getDate() - 1);
        }

        while (daysWithEntries.has(localDateStr(d))) {
            streak++;
            d.setDate(d.getDate() - 1);
            if (streak > 3650) break;
        }

        stats.streak = streak;
        saveStats();
        return streak;
    }

    function countDaysDone(habit) {
        const start = habit.startDate;
        const end = endDateOf(habit);
        return Object.entries(habit.completions || {}).reduce((acc, [d, c]) => {
            return d >= start && d <= end && c > 0 ? acc + 1 : acc;
        }, 0);
    }

    function calculateStats() {
        const t = today();
        let total = habits.length;
        plans.forEach(p => {
            p.items.forEach(it => {
                total++;
            });
        });

        $('#statStreak').textContent = calculateStreak();
        $('#statToday').textContent = `${stats.today}/${Math.max(total, stats.today)}`;
        $('#statTotal').textContent = stats.total;
        $('#dayProgress').textContent = '';
    }

    // ===================== Счётчики (постоянные, не зависят от удаления задач) =====================
    const STATS_KEY = 'habit-tracker-stats';

    function loadStats() {
        let todayStr = today();
        try {
            const raw = localStorage.getItem(STATS_KEY);
            if (raw) {
                stats = JSON.parse(raw) || { total: 0, today: 0, todayDate: '' };
            } else {
                // Миграция: собрать счётчики из текущих данных один раз
                let total = lifetimeTotal;
                let todayCount = 0;
                habits.forEach(h => {
                    if (isPeriodless(h)) {
                        if (getHabitCount(h, todayStr) > 0) todayCount++;
                        return;
                    }
                    total += countDaysDone(h);
                    if (getHabitCount(h, todayStr) > 0) todayCount++;
                });
                plans.forEach(p => {
                    p.items.forEach(it => {
                        total += planItemDoneDays(p, it);
                        if (isPlanItemDone(p, it, todayStr)) todayCount++;
                    });
                });
                stats = { total, today: todayCount, todayDate: todayStr };
                localStorage.setItem(STATS_KEY, JSON.stringify(stats));
                cloudQueue(STATS_KEY);
            }
        } catch {
            stats = { total: 0, today: 0, todayDate: '' };
        }
        if (!stats) stats = { total: 0, today: 0, todayDate: '' };
        // «Сегодня» обнуляется только при наступлении нового дня (00:00)
        if (stats.todayDate !== todayStr) {
            stats.today = 0;
            stats.todayDate = todayStr;
            saveStats();
        }
    }

    function saveStats() {
        localStorage.setItem(STATS_KEY, JSON.stringify(stats));
        cloudQueue(STATS_KEY);
    }

    // (v6) настройка «за сколько минут напоминать» удалена вместе с предупреждением (warn).
    function loadSettings() { /* больше нечего загружать */ }

    function saveSettings() {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({}));
        cloudQueue(SETTINGS_KEY);
    }

    // ===================== История выполнений =====================
    function loadHistory() {
        try {
            const raw = localStorage.getItem(HISTORY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            history = Array.isArray(parsed) ? parsed.filter(h => h && typeof h.id === 'string') : [];
        } catch {
            history = [];
        }
    }

    function saveHistory() {
        if (history.length > 500) history.length = 500;
        localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
        cloudQueue(HISTORY_KEY);
    }

    function logCompletion(container, item, dateStr, wasDone, isDone) {
        if (isDone && !wasDone) {
            history.unshift({
                id: item.id,
                date: dateStr,
                name: item.name,
                emoji: item.emoji,
                color: container.color || null
            });
            stats.total += 1;
            if (stats.todayDate === dateStr) stats.today += 1;
        } else if (!isDone && wasDone) {
            const idx = history.findIndex(h => h.id === item.id && h.date === dateStr);
            if (idx >= 0) {
                history.splice(idx, 1);
                stats.total = Math.max(stats.total - 1, 0);
                if (stats.todayDate === dateStr) stats.today = Math.max(stats.today - 1, 0);
            }
        }
        saveHistory();
        saveStats();
    }

    function formatHistoryDate(dateStr) {
        return new Date(dateStr + 'T00:00:00')
            .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
    }

    function renderHistory() {
        const list = $('#historyList');
        if (!list) return;
        if (history.length === 0) {
            list.innerHTML = '<div class="history-empty">История пуста — выполните задачу, и она появится здесь</div>';
            return;
        }
        list.innerHTML = '';
        history.forEach(h => {
            const row = document.createElement('div');
            row.className = 'history-row';
            row.innerHTML = `
                <div class="history-emoji">${h.emoji || '✅'}</div>
                <div class="history-info">
                    <div class="history-name">${escapeHtml(h.name)}</div>
                    <div class="history-date">${formatHistoryDate(h.date)}</div>
                </div>
                <button type="button" class="history-del" title="Удалить из истории" aria-label="Удалить из истории">🗑</button>
            `;
            row.querySelector('.history-del').addEventListener('click', () => {
                const entry = history.find(x => x.id === h.id && x.date === h.date);
                history = history.filter(x => x.id !== h.id || x.date !== h.date);
                if (entry) {
                    stats.total = Math.max(stats.total - 1, 0);
                    if (stats.todayDate === entry.date) stats.today = Math.max(stats.today - 1, 0);
                    saveStats();
                }
                saveHistory();
                renderHistory();
                calculateStats();
                showToast('Удалено из истории');
            });
            list.appendChild(row);
        });
    }

    function openHistoryModal() {
        renderHistory();
        $('#historyOverlay').classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
    }

    function closeHistoryModal() {
        $('#historyOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        updateBackButton();
    }

    function focusTodaySection() {
        if (activeTab === 'plans') switchTab('habits');
        const el = $('#habitsSection');
        if (el) {
            requestAnimationFrame(() => {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }

    function createEmptyState() {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.id = 'emptyState';
        div.innerHTML = `
            <button type="button" class="empty-icon" id="emptyAddBtn" title="Добавить задачу" aria-label="Добавить задачу">📋</button>
            <p>Добавьте первую задачу, чтобы начать отслеживание</p>
        `;
        div.querySelector('#emptyAddBtn').addEventListener('click', () => openModal());
        return div;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function normalizeEmoji(value) {
        // Оставляем ровно один смайлик (grapheme cluster), чтобы не резать ZWJ-последовательности
        const v = value.trim();
        if (!v) return '';
        if (Intl && Intl.Segmenter) {
            try {
                const seg = new Intl.Segmenter('ru', { granularity: 'grapheme' });
                const first = Array.from(seg.segment(v))[0];
                if (first) return first.segment;
            } catch { /* fallback ниже */ }
        }
        return Array.from(v)[0] || v;
    }

    function emojiKey(emoji) {
        return emoji.replace(/\uFE0F/g, '');
    }

    const EMOJI_LOOKUP = {};
    Object.entries(EMOJI_DEFAULTS).forEach(([k, v]) => {
        EMOJI_LOOKUP[emojiKey(k)] = v;
    });

    function getSelectedEmoji() {
        const custom = normalizeEmoji($('#customEmoji').value.trim());
        if (custom) return custom;
        return $('.emoji-btn.selected')?.dataset.emoji || '';
    }

    function applyEmojiName(emoji) {
        if (editingId) return; // В режиме редактирования ничего не трогаем
        if (userEditedName) return; // Если пользователь сам ввел название, не трогаем
        const defaultName = EMOJI_LOOKUP[emojiKey(emoji)];
        if (!defaultName) return;
        $('#habitName').value = defaultName;
        $('#nameError').hidden = true;
    }

    function syncPresetSelection(emoji) {
        const key = emojiKey(emoji);
        let matched = false;
        $$('.emoji-btn').forEach(btn => {
            const isMatch = emojiKey(btn.dataset.emoji) === key;
            btn.classList.toggle('selected', isMatch);
            if (isMatch) matched = true;
        });
        return matched;
    }

    function renderPlanItemCard(plan, item, t, end) {
        const count = getPlanItemCount(plan, item.id, t);
        const done = count > 0;
        const progress = done ? 100 : 0;
        const todayPct = done ? 100 : 0;
        const itemPct = Math.round(planItemProgressFrac(plan, item) * 100);
        const inPeriod = t >= plan.startDate && t <= end;
        const card = document.createElement('div');
        card.className = `habit-card plan-item-card${done ? ' completed' : ''}`;
        card.style.setProperty('--habit-color', plan.color);
        card.innerHTML = `
            <div class="habit-emoji">${item.emoji}</div>
            <div class="habit-info">
                <div class="habit-name-row">
                    <div class="habit-name">${escapeHtml(item.name)}</div>
                    <span class="habit-pct" title="Выполнение сегодня">${todayPct}%</span>
                </div>
                <div class="habit-progress-bar">
                    <div class="habit-progress-fill" style="width:${progress}%;background:${plan.color}"></div>
                </div>
                <div class="habit-count">${done ? '✓ сегодня' : 'не сделано'} • ${itemPct}% за период</div>
            </div>
            <div class="habit-actions">
                <button class="btn-check${done ? ' checked' : ''}" data-plan="${plan.id}" data-item="${item.id}"
                    title="${inPeriod ? (done ? 'Отменить шаг' : 'Отметить') : 'Сегодня вне периода'}"
                    ${inPeriod ? '' : 'disabled'}>${done ? '✓' : '+'}</button>
                <button class="btn-edit-plan-item" data-plan="${plan.id}" data-item="${item.id}"
                    title="Редактировать задачу" aria-label="Редактировать задачу">✏️</button>
                <button class="btn-extract-plan" data-plan="${plan.id}" data-item="${item.id}"
                    title="Сделать отдельной задачей" aria-label="Сделать отдельной задачей">📤</button>
            </div>
        `;
        return card;
    }

    function createPlanGroupCard(plan) {
        const pct = planProgressPct(plan);
        const pctText = pct === null ? '—' : `${pct}%`;
        const t = today();
        const end = planEndDateOf(plan);

        const group = document.createElement('div');
        group.className = 'plan-group';
        group.dataset.planId = plan.id;
        group.style.setProperty('--habit-color', plan.color);
        group.innerHTML = `
            <div class="plan-group-head">
                <div class="plan-group-emoji">${plan.emoji}</div>
                <div class="plan-group-info">
                    <div class="plan-group-name-row">
                        <div class="plan-group-name">${escapeHtml(plan.name)}</div>
                        <span class="habit-pct" title="Прогресс плана">${pctText}</span>
                    </div>
                </div>
            </div>
        `;

        const itemsWrap = document.createElement('div');
        itemsWrap.className = 'plan-group-items';
        plan.items.forEach(item => {
            itemsWrap.appendChild(renderPlanItemCard(plan, item, t, end));
        });
        group.appendChild(itemsWrap);

        return group;
    }

    function renderHabits() {
        const list = $('#habitsList');
        list.innerHTML = '';

        if (habits.length === 0 && plans.length === 0) {
            list.appendChild(createEmptyState());
            calculateStats();
            return;
        }

        const t = today();

        plans.forEach(plan => {
            list.appendChild(createPlanGroupCard(plan));
        });

        habits.forEach((habit, index) => {
            const count = getHabitCount(habit, t);
            const done = count > 0;
            const progress = done ? 100 : 0;
            const todayPct = done ? 100 : 0;
            const end = endDateOf(habit);
            const noPeriod = isPeriodless(habit);
            const inPeriod = noPeriod || (t >= habit.startDate && t <= end);
            const finished = !noPeriod && t > end;
            const remaining = Math.max(diffDays(t, end) + 1, 0);
            const doneDays = countDaysDone(habit);
            const overallPct = noPeriod ? null : Math.round(Math.min((doneDays / habit.periodDays) * 100, 100));

            let status;
            if (noPeriod) {
                status = `${done ? '✓ сегодня' : 'не сделано'} • выполнено всего: ${habit.lifetimeCount || 0}`;
            } else if (finished) {
                status = `Выполнено ${doneDays} из ${habit.periodDays} ${pld(habit.periodDays)} • ${overallPct}% за период`;
            } else {
                status = `${done ? '✓ сегодня' : 'не сделано'} • ${overallPct}% за период`;
            }
            if (habit.reminderTime) status += ` • 🔔 ${habit.reminderTime}`;

            const card = document.createElement('div');
            card.className = `habit-card${done ? ' completed' : ''}${finished ? ' finished' : ''}`;
            card.style.setProperty('--habit-color', habit.color);
            card.style.animationDelay = `${index * 0.05}s`;
            card.dataset.id = habit.id;

            card.innerHTML = `
                <div class="habit-emoji${habit.emoji ? '' : ' no-emoji'}">${habit.emoji || ''}</div>
                <div class="habit-info">
                    <div class="habit-name-row">
                        <div class="habit-name">${escapeHtml(habit.name)}</div>
                        <span class="habit-pct" title="Выполнение сегодня">${todayPct}%</span>
                    </div>
                    <div class="habit-progress-bar">
                        <div class="habit-progress-fill" style="width:${progress}%;background:${habit.color}"></div>
                    </div>
                    <div class="habit-count">${status}</div>
                </div>
                <div class="habit-actions">
                    <button class="btn-check${done ? ' checked' : ''}" data-id="${habit.id}"
                        title="${inPeriod ? (done ? 'Отменить шаг' : 'Отметить') : 'Сегодня вне периода'}"
                        aria-label="${inPeriod ? (done ? 'Отменить шаг' : 'Отметить') : 'Сегодня вне периода'}"
                        ${inPeriod ? '' : 'disabled'}>${done ? '✓' : '+'}</button>
                    ${plans.length > 0 ? `<button class="btn-move-to-plan" data-id="${habit.id}" title="Перенести в план" aria-label="Перенести в план">📋</button>` : ''}
                    <button class="btn-edit" data-id="${habit.id}" title="Редактировать" aria-label="Редактировать">✏️</button>
                    <button class="btn-delete" data-id="${habit.id}" title="Удалить" aria-label="Удалить">🗑</button>
                </div>
            `;

            list.appendChild(card);
        });

        list.querySelectorAll('.btn-check').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.dataset.plan) {
                    const plan = plans.find(p => p.id === btn.dataset.plan);
                    if (plan) togglePlanItem(plan, btn.dataset.item);
                } else {
                    toggleHabit(btn.dataset.id);
                }
            });
        });

        list.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => openModal(btn.dataset.id));
        });

        list.querySelectorAll('.btn-move-to-plan').forEach(btn => {
            btn.addEventListener('click', () => openMoveToPlanDialog(btn.dataset.id));
        });

        list.querySelectorAll('.btn-extract-plan').forEach(btn => {
            btn.addEventListener('click', () => movePlanItemToHabit(btn.dataset.plan, btn.dataset.item));
        });

        list.querySelectorAll('.btn-edit-plan-item').forEach(btn => {
            btn.addEventListener('click', () => openItemModal(btn.dataset.plan, btn.dataset.item));
        });

        list.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', () => deleteHabit(btn.dataset.id));
        });

        list.querySelectorAll('.habit-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                const editBtn = card.querySelector('.btn-edit');
                if (editBtn) openModal(editBtn.dataset.id);
            });
        });

        calculateStats();
    }

    function toggleHabitOnDate(habit, dateStr) {
        if (!habit.completions) habit.completions = {};
        const current = habit.completions[dateStr] || 0;
        habit.completions[dateStr] = current > 0 ? 0 : 1;

        if (tg && tg.HapticFeedback) {
            try {
                tg.HapticFeedback.impactOccurred('light');
            } catch {
                /* нет вибрации */
            }
        }
    }

    function toggleHabit(id) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;

        const t = today();

        if (isPeriodless(habit)) {
            const wasDone = getHabitCount(habit, t) > 0;
            toggleHabitOnDate(habit, t);
            const nowDone = getHabitCount(habit, t) > 0;
            logCompletion(habit, habit, t, wasDone, nowDone);

            if (!wasDone && nowDone) {
                habit.lifetimeCount = (habit.lifetimeCount || 0) + 1;
                Object.keys(habit.completions).forEach(d => {
                    if (d !== t) delete habit.completions[d];
                });
            } else if (wasDone && !nowDone) {
                habit.lifetimeCount = Math.max((habit.lifetimeCount || 0) - 1, 0);
            }

            save();
            renderHabits();
            renderPlan();
            return;
        }

        if (t < habit.startDate || t > endDateOf(habit)) return;

        const wasDone = getHabitCount(habit, t) > 0;
        toggleHabitOnDate(habit, t);
        const nowDone = getHabitCount(habit, t) > 0;
        logCompletion(habit, habit, t, wasDone, nowDone);
        save();
        renderHabits();
        renderPlan();
    }

    function isAnyOverlayOpen() {
        return $('#welcomeOverlay').classList.contains('active') ||
            $('#modalOverlay').classList.contains('active') ||
            $('#confirmOverlay').classList.contains('active') ||
            $('#periodInputOverlay').classList.contains('active') ||
            $('#timeInputOverlay').classList.contains('active') ||
            $('#planModalOverlay').classList.contains('active') ||
            $('#itemModalOverlay').classList.contains('active') ||
            $('#historyOverlay').classList.contains('active') ||
            (!$('#moveOverlay').hidden && $('#moveOverlay').classList.contains('active'));
    }
    function updateBackButton() {
        if (!tg || !tg.BackButton) return;
        try {
            if (isAnyOverlayOpen()) {
                tg.BackButton.show();
            } else {
                tg.BackButton.hide();
            }
        } catch {
            /* нет BackButton */
        }
    }

    // ---- Приветственное окно для новых пользователей ----
    function isWelcomeVisible() {
        return $('#welcomeOverlay').classList.contains('active');
    }
    function showWelcome() {
        if (localStorage.getItem(WELCOME_KEY)) return;
        // у пользователя уже есть данные — окно «новым» не показываем
        if (localStorage.getItem(STORAGE_KEY)) {
            try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
            return;
        }
        $('#welcomeOverlay').classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
    }
    function hideWelcome() {
        $('#welcomeOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        try { localStorage.setItem(WELCOME_KEY, '1'); } catch { /* ignore */ }
        updateBackButton();
    }
    // после серверного синка могли прийти данные — окно больше не нужно
    function maybeWelcomeAfterSync() {
        if (isWelcomeVisible() && localStorage.getItem(STORAGE_KEY)) hideWelcome();
    }

    function showConfirm(message) {
        return new Promise((resolve) => {
            confirmResolver = resolve;
            $('#confirmText').textContent = message;
            $('#confirmOverlay').classList.add('active');
            document.body.classList.add('modal-open');
            updateBackButton();
            setTimeout(() => $('#confirmOk').focus(), 100);
        });
    }

    function resolveConfirm(value) {
        $('#confirmOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        const resolver = confirmResolver;
        confirmResolver = null;
        updateBackButton();
        if (resolver) resolver(value);
    }

    function openMoveToPlanDialog(habitId) {
        if (movingHabitId) return;
        if (plans.length === 0) {
            showToast('Сначала создайте план');
            return;
        }

        const habit = habits.find(h => h.id === habitId);
        if (!habit) return;

        movingHabitId = habitId;
        moveOverlayScrollY = window.scrollY;

        const overlay = $('#moveOverlay');
        overlay.hidden = false;
        document.body.classList.add('move-mode');

        $$('#habitsList .plan-group').forEach(group => {
            group.classList.add('can-select');
            group.addEventListener('click', onMovePlanPress);
        });

        updateBackButton();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => overlay.classList.add('active'));
        });

        const firstPlan = $('#habitsList .plan-group');
        if (firstPlan) {
            setTimeout(() => {
                if (movingHabitId) firstPlan.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 80);
        }
    }

    function closeMoveToPlanDialog() {
        const overlay = $('#moveOverlay');
        overlay.classList.remove('active');
        document.body.classList.remove('move-mode');

        $$('#habitsList .plan-group').forEach(group => {
            group.classList.remove('can-select', 'chosen');
            group.removeEventListener('click', onMovePlanPress);
        });

        movingHabitId = null;
        if (moveOverlayScrollY !== null) {
            window.scrollTo(0, moveOverlayScrollY);
            moveOverlayScrollY = null;
        }
        updateBackButton();
        setTimeout(() => {
            if (overlay.classList.contains('active')) return;
            overlay.hidden = true;
        }, 380);
    }

    function onMovePlanPress(e) {
        e.stopPropagation();
        const group = e.currentTarget;
        const planId = group.dataset.planId;
        if (!planId || !movingHabitId) return;

        const habitId = movingHabitId;
        group.classList.add('chosen');

        let alreadyMoving = false;
        function runMove() {
            if (alreadyMoving) return;
            alreadyMoving = true;
            moveHabitToPlan(habitId, planId);
            closeMoveToPlanDialog();
        }

        $$('#habitsList .habit-card[data-id="' + habitId + '"]').forEach(card => {
            card.classList.add('leaving');
            card.style.pointerEvents = 'none';
        });

        setTimeout(runMove, 420);
    }

    function moveHabitToPlan(habitId, planId) {
        const habit = habits.find(h => h.id === habitId);
        const plan = plans.find(p => p.id === planId);
        
        if (!habit || !plan) return;

        // Добавляем задачу в план
        const newItem = {
            id: generateId(),
            emoji: habit.emoji,
            name: habit.name,
            periodDays: habit.periodDays || DEFAULT_PERIOD,
            completions: {}
        };
        
        plan.items.push(newItem);
        
        // Удаляем задачу из обычных задач
        habits = habits.filter(h => h.id !== habitId);
        
        // Сохраняем
        save();
        savePlans();
        
        // Обновляем UI
        renderHabits();
        renderPlan();
        const group = $(`#habitsList .plan-group[data-plan-id="${planId}"]`);
        if (group) {
            group.classList.add('just-chosen');
            setTimeout(() => group.classList.remove('just-chosen'), 950);
        }
        showToast(`Задача перенесена в план «${plan.name}»`);
    }

    function movePlanItemToHabit(planId, itemId) {
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;

        const newHabit = {
            id: generateId(),
            name: item.name,
            emoji: item.emoji,
            color: plan.color,
            periodDays: item.periodDays || DEFAULT_PERIOD,
            reminderTime: null,
            startDate: plan.startDate,
            completions: {},
            createdAt: today()
        };

        Object.keys(plan.completions || {}).forEach(d => {
            const c = plan.completions[d][itemId];
            if (c) newHabit.completions[d] = c;
        });

        habits.push(newHabit);

        plan.items = plan.items.filter(i => i.id !== itemId);
        Object.keys(plan.completions || {}).forEach(d => {
            delete plan.completions[d][itemId];
            if (Object.keys(plan.completions[d]).length === 0) delete plan.completions[d];
        });

        save();
        savePlans();
        refreshAll();
        showToast(`Задача «${item.name}» вынесена из плана`);
    }

    async function deleteHabit(id) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;

        const ok = await showConfirm(`Удалить задачу «${habit.name}»?`);
        if (!ok) return;

        habits = habits.filter(h => h.id !== id);
        save();
        renderHabits();
        renderPlan();
        showToast('Задача удалена');
    }

    function addHabit(name, emoji, color, periodDays, reminderTime) {
        habits.push({
            id: generateId(),
            name,
            emoji,
            color,
            periodDays,
            reminderTime: reminderTime || null,
            startDate: today(),
            completions: {},
            lifetimeCount: 0,
            createdAt: today()
        });
        save();
        renderHabits();
        renderPlan();
        showToast(periodDays === null
            ? 'Задача добавлена — без периода'
            : `Задача добавлена — период ${formatPeriodFromDate(periodDays, today())}`);
    }

    function updateHabit(id, name, emoji, color, periodDays, reminderTime) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;
        habit.name = name;
        habit.emoji = emoji;
        habit.color = color;
        habit.periodDays = periodDays;
        habit.reminderTime = reminderTime || null;
        save();
        renderHabits();
        renderPlan();
        showToast('Изменения сохранены');
    }

    // ===================== Планы =====================
    function loadPlans() {
        try {
            const raw = localStorage.getItem(PLANS_KEY);
            plans = raw ? JSON.parse(raw) : [];
        } catch {
            plans = [];
        }

        plans = plans.filter(p =>
            p && typeof p === 'object' &&
            typeof p.id === 'string' &&
            typeof p.name === 'string' &&
            p.name.trim() !== ''
        );

        plans.forEach(p => {
            p.periodDays = Math.min(Math.max(parseInt(p.periodDays, 10) || DEFAULT_PERIOD, 1), 365);
            if (!Array.isArray(p.items)) p.items = [];
            p.items.forEach(it => {
                it.periodDays = Math.min(Math.max(parseInt(it.periodDays, 10) || DEFAULT_PERIOD, 1), 365);
                if (!it.emoji) it.emoji = '📝';
                if (!it.id) it.id = generateId();
            });
            if (typeof p.completions !== 'object' || p.completions === null || Array.isArray(p.completions)) {
                p.completions = {};
            }
            if (!p.emoji) p.emoji = '📅';
            if (!p.color) p.color = '#22a2f0';
            if (!p.startDate) p.startDate = p.createdAt || today();
        });
    }

    function savePlans() {
        localStorage.setItem(PLANS_KEY, JSON.stringify(plans));
        cloudQueue(PLANS_KEY);
    }

    function planEndDateOf(plan) {
        return addDays(plan.startDate, plan.periodDays - 1);
    }

    function getPlanItemCount(plan, itemId, date) {
        if (!plan.completions[date]) return 0;
        return plan.completions[date][itemId] || 0;
    }

    function isPlanItemDone(plan, item, date) {
        return getPlanItemCount(plan, item.id, date) > 0;
    }

    // Универсальный доступ к выполнению: для плана (container=plan, item=item),
    // для задачи (container=habit, item=habit)
    function getCompletionCount(container, item, date) {
        if (Array.isArray(container.items)) {
            return getPlanItemCount(container, item.id, date);
        }
        return getHabitCount(container, date);
    }

    function isItemDayDone(container, item, date) {
        return getCompletionCount(container, item, date) > 0;
    }

    // Полностью выполненные дни задачи плана (для «Всего выполнено»).
    function planItemDoneDays(plan, item) {
        const period = Math.min(Math.max(parseInt(item.periodDays, 10) || DEFAULT_PERIOD, 1), 365);
        let done = 0;
        for (let i = 0; i < period; i++) {
            const d = addDays(plan.startDate, i);
            if (isPlanItemDone(plan, item, d)) done++;
        }
        return done;
    }

    // Прогресс отдельной задачи плана: выполненные дни / её собственный период.
    // Например, задача на 30 дней с 6 выполненными днями → 6/30 = 20%.
    // Период ПЛАНА на этот расчёт не влияет.
    function planItemProgressFrac(plan, item) {
        const period = Math.min(Math.max(parseInt(item.periodDays, 10) || DEFAULT_PERIOD, 1), 365);
        return planItemDoneDays(plan, item) / period;
    }

    // Общий прогресс плана: среднее из прогрессов его задач (1/365 + 1/30 → один общий %).
    function planProgressPct(plan) {
        if (!plan.items || plan.items.length === 0) return null;
        const sum = plan.items.reduce((acc, it) => acc + planItemProgressFrac(plan, it), 0);
        return Math.round((sum / plan.items.length) * 100);
    }

    function togglePlanItemOnDate(plan, itemId, dateStr) {
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;
        if (!plan.completions[dateStr]) plan.completions[dateStr] = {};
        const cur = plan.completions[dateStr][itemId] || 0;
        plan.completions[dateStr][itemId] = cur > 0 ? 0 : 1;
    }

    function togglePlanItem(plan, itemId) {
        const t = today();
        if (t < plan.startDate || t > planEndDateOf(plan)) return;
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;
        const wasDone = isPlanItemDone(plan, item, t);
        togglePlanItemOnDate(plan, itemId, t);
        const nowDone = isPlanItemDone(plan, item, t);
        logCompletion(plan, item, t, wasDone, nowDone);
        savePlans();
        refreshAll();
        if (tg && tg.HapticFeedback) {
            try { tg.HapticFeedback.impactOccurred('light'); } catch { /* без haptic */ }
        }
    }

    function createPlansEmptyState() {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.innerHTML = `
            <button type="button" class="empty-icon" title="Создать план" aria-label="Создать план">🗓️</button>
            <p>Создайте план — добавьте в него задачи и отмечайте по дням</p>
        `;
        div.querySelector('.empty-icon').addEventListener('click', () => openPlanModal());
        return div;
    }

    function renderPlanItem(plan, item, t, end) {
        const done = isPlanItemDone(plan, item, t);
        const inPeriod = t >= plan.startDate && t <= end;
        return `
            <div class="plan-item${done ? ' done' : ''}">
                <div class="plan-item-emoji">${item.emoji}</div>
                <div class="plan-item-info">
                    <div class="plan-item-name">${escapeHtml(item.name)}</div>
                </div>
                <div class="plan-item-actions">
                    <button type="button" class="plan-item-btn plan-item-up" data-plan="${plan.id}" data-item="${item.id}" title="Выше">▲</button>
                    <button type="button" class="plan-item-btn plan-item-down" data-plan="${plan.id}" data-item="${item.id}" title="Ниже">▼</button>
                    <button type="button" class="plan-item-btn plan-item-edit" data-plan="${plan.id}" data-item="${item.id}" title="Редактировать задачу">✏️</button>
                    <button type="button" class="plan-item-btn plan-item-extract" data-plan="${plan.id}" data-item="${item.id}" title="Сделать отдельной задачей">📤</button>
                    <button type="button" class="plan-item-btn plan-item-remove" data-plan="${plan.id}" data-item="${item.id}" title="Удалить задачу">✕</button>
                    <button type="button" class="plan-item-check${done ? ' checked' : ''}" data-plan="${plan.id}" data-item="${item.id}"
                        title="${inPeriod ? (done ? 'Отменить шаг' : 'Отметить') : 'Сегодня вне периода'}"
                        ${inPeriod ? '' : 'disabled'}>${done ? '✓' : '+'}</button>
                </div>
            </div>
        `;
    }

    function renderPlans() {
        const list = $('#plansList');
        if (!list) return;
        list.innerHTML = '';

        if (plans.length === 0) {
            list.appendChild(createPlansEmptyState());
            return;
        }

        const t = today();

        plans.forEach(plan => {
            const end = planEndDateOf(plan);
            const pct = planProgressPct(plan);
            const pctText = pct === null ? '—' : `${pct}%`;

            const card = document.createElement('div');
            card.className = 'plan-card';
            card.style.setProperty('--habit-color', plan.color);
            card.innerHTML = `
                <div class="plan-card-head">
                    <div class="plan-card-title">
                        <div class="plan-card-emoji">${plan.emoji}</div>
                        <div class="plan-card-name">${escapeHtml(plan.name)}</div>
                        <span class="habit-pct" title="Прогресс плана">${pctText}</span>
                    </div>
                    <div class="plan-card-actions">
                        <button type="button" class="btn-edit plan-card-edit" data-plan="${plan.id}" title="Редактировать план">✏️</button>
                        <button type="button" class="btn-delete plan-card-delete" data-plan="${plan.id}" title="Удалить план">🗑️</button>
                    </div>
                </div>
                <div class="plan-card-meta">
                    <span>${formatPeriodFromDate(plan.periodDays, plan.startDate)}</span>
                </div>
                <div class="plan-items">
                    ${plan.items.map(item => renderPlanItem(plan, item, t, end)).join('')}
                </div>
                <button type="button" class="plan-add-item" data-add-item="${plan.id}">+ Добавить задачу</button>
            `;
            list.appendChild(card);
        });
    }

    function setPlanPeriod(value) {
        value = Math.min(Math.max(parseInt(value, 10) || DEFAULT_PERIOD, 1), 365);
        const input = $('#planPeriodDaysInput');
        const hidden = $('#planPeriod');
        const display = $('#planPeriodValue');
        const presets = $$('#planPeriodPresets .preset-btn');
        if (input) input.value = value;
        if (hidden) hidden.value = value;
        if (display) display.textContent = formatPeriod(value);
        if (presets.length) {
            presets.forEach(btn => {
                btn.removeAttribute('data-selected');
                if (parseInt(btn.dataset.days, 10) === value) {
                    btn.setAttribute('data-selected', 'true');
                }
            });
        }
    }

    function openPlanModal(planId) {
        editingPlanId = planId || null;
        const overlay = $('#planModalOverlay');
        if (!overlay) return;
        const title = $('#planModalTitle');
        const submitBtn = $('#planSubmitBtn');

        if (editingPlanId) {
            const plan = plans.find(p => p.id === editingPlanId);
            if (!plan) return;
            planUserEditedName = true;
            title.textContent = 'Редактировать план';
            submitBtn.textContent = 'Сохранить';
            $('#planName').value = plan.name;
            $('#planId').value = plan.id;

            const hasPreset = Array.from($$('#planEmojiPicker .p-emoji-btn'))
                .some(b => emojiKey(b.dataset.emoji) === emojiKey(plan.emoji));
            $$('#planEmojiPicker .p-emoji-btn').forEach(b => {
                b.classList.toggle('selected', emojiKey(b.dataset.emoji) === emojiKey(plan.emoji));
            });
            $('#planCustomEmoji').value = hasPreset ? '' : plan.emoji;

            $$('#planColorPicker .p-color-btn').forEach(b => {
                b.classList.toggle('selected', b.dataset.color === plan.color);
            });
            setPlanPeriod(plan.periodDays);
        } else {
            planUserEditedName = false;
            title.textContent = 'Новый план';
            submitBtn.textContent = 'Создать';
            $('#planForm').reset();
            $('#planId').value = '';
            $$('#planEmojiPicker .p-emoji-btn').forEach((b, i) => {
                b.classList.toggle('selected', i === 0);
            });
            $$('#planColorPicker .p-color-btn').forEach((b, i) => {
                b.classList.toggle('selected', i === 0);
            });
            setPlanPeriod(30);
        }

        $('#planNameError').hidden = true;
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
        setTimeout(() => $('#planName').focus(), 100);
    }

    function closePlanModal() {
        $('#planModalOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        updateBackButton();
    }

    function setItemPeriod(value) {
        value = Math.min(Math.max(parseInt(value, 10) || DEFAULT_PERIOD, 1), 365);
        const input = $('#itemPeriodDays');
        const display = $('#itemPeriodValue');
        const presets = $$('#itemPeriodPresets .preset-btn');
        if (input) input.value = value;
        if (display) display.textContent = formatPeriod(value);
        if (presets.length) {
            presets.forEach(btn => {
                btn.removeAttribute('data-selected');
                if (parseInt(btn.dataset.days, 10) === value) {
                    btn.setAttribute('data-selected', 'true');
                }
            });
        }
    }

    function openItemModal(planId, itemId) {
        itemTargetPlanId = planId || null;
        const overlay = $('#itemModalOverlay');
        if (!overlay || !itemTargetPlanId) return;
        const title = $('#itemModalTitle');
        const submitBtn = $('#itemSubmitBtn');

        if (itemId) {
            const plan = plans.find(p => p.id === planId);
            const item = plan && plan.items.find(i => i.id === itemId);
            if (!plan || !item) return;
            editingItemId = itemId;
            itemUserEditedName = true;
            title.textContent = 'Редактировать задачу';
            submitBtn.textContent = 'Сохранить';
            $('#itemForm').reset();
            $('#itemPlanId').value = planId;
            $('#itemName').value = item.name;

            const hasPreset = Array.from($$('.i-emoji-btn'))
                .some(b => emojiKey(b.dataset.emoji) === emojiKey(item.emoji));
            $$('.i-emoji-btn').forEach(b => {
                b.classList.toggle('selected', emojiKey(b.dataset.emoji) === emojiKey(item.emoji));
            });
            $('#itemCustomEmoji').value = hasPreset ? '' : item.emoji;
            setItemPeriod(item.periodDays);
        } else {
            editingItemId = null;
            itemUserEditedName = false;
            title.textContent = 'Добавить задачу в план';
            submitBtn.textContent = 'Добавить';
            $('#itemForm').reset();
            $('#itemPlanId').value = itemTargetPlanId;
            $$('.i-emoji-btn').forEach((b, i) => {
                b.classList.toggle('selected', i === 0);
            });
            $('#itemCustomEmoji').value = '';
            setItemPeriod(30);
        }
        $('#itemNameError').hidden = true;
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
        setTimeout(() => $('#itemName').focus(), 100);
    }

    function closeItemModal() {
        $('#itemModalOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        updateBackButton();
    }

    function getSelectedPlanEmoji() {
        const custom = normalizeEmoji($('#planCustomEmoji').value.trim());
        if (custom) return custom;
        return $('#planEmojiPicker .p-emoji-btn.selected')?.dataset.emoji || '📅';
    }

    function getSelectedItemEmoji() {
        const custom = normalizeEmoji($('#itemCustomEmoji').value.trim());
        if (custom) return custom;
        return $('.i-emoji-btn.selected')?.dataset.emoji || '📚';
    }

    function applyPlanEmojiName(emoji) {
        if (planUserEditedName) return;
        const defaultName = EMOJI_LOOKUP[emojiKey(emoji)];
        if (defaultName) $('#planName').value = defaultName;
    }

    function applyItemEmojiName(emoji) {
        if (itemUserEditedName) return;
        const defaultName = EMOJI_LOOKUP[emojiKey(emoji)];
        if (defaultName) $('#itemName').value = defaultName;
    }

    function createPlan(name, emoji, color, periodDays) {
        plans.push({
            id: generateId(),
            name,
            emoji,
            color,
            periodDays,
            startDate: today(),
            items: [],
            completions: {},
            createdAt: today()
        });
        savePlans();
        refreshAll();
        showToast(`План «${name}» создан — период ${formatPeriodFromDate(periodDays, today())}`);
    }

    function updatePlan(id, name, emoji, color, periodDays) {
        const plan = plans.find(p => p.id === id);
        if (!plan) return;
        plan.name = name;
        plan.emoji = emoji;
        plan.color = color;
        plan.periodDays = periodDays;
        savePlans();
        refreshAll();
        showToast('План сохранён');
    }

    async function deletePlan(id) {
        const plan = plans.find(p => p.id === id);
        if (!plan) return;
        const ok = await showConfirm(`Удалить план «${plan.name}»? Все задачи внутри будут удалены.`);
        if (!ok) return;
        plans = plans.filter(p => p.id !== id);
        savePlans();
        refreshAll();
        showToast('План удалён');
    }

    function addPlanItem(planId, name, emoji, periodDays) {
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;
        plan.items.push({ id: generateId(), name, emoji, periodDays });
        savePlans();
        refreshAll();
        showToast('Задача добавлена в план');
    }

    function updatePlanItem(planId, itemId, name, emoji, periodDays) {
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;
        const item = plan.items.find(i => i.id === itemId);
        if (!item) return;
        item.name = name;
        item.emoji = emoji;
        item.periodDays = periodDays;
        savePlans();
        refreshAll();
        showToast('Задача сохранена');
    }

    function removePlanItem(planId, itemId) {
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;
        plan.items = plan.items.filter(i => i.id !== itemId);
        Object.keys(plan.completions || {}).forEach(d => {
            delete plan.completions[d][itemId];
            if (Object.keys(plan.completions[d]).length === 0) delete plan.completions[d];
        });
        savePlans();
        refreshAll();
    }

    function movePlanItem(planId, itemId, dir) {
        const plan = plans.find(p => p.id === planId);
        if (!plan) return;
        const idx = plan.items.findIndex(i => i.id === itemId);
        const newIdx = idx + dir;
        if (idx < 0 || newIdx < 0 || newIdx >= plan.items.length) return;
        const item = plan.items.splice(idx, 1)[0];
        plan.items.splice(newIdx, 0, item);
        savePlans();
        refreshAll();
    }

    function switchTab(tab) {
        activeTab = tab;
        const isHabits = tab === 'habits';
        $('#viewHabits').hidden = !isHabits;
        $('#viewPlans').hidden = isHabits;
        $('#statsBar').hidden = !isHabits;
        $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        $('#addHabitBtn').textContent = isHabits ? '+ Задача' : '+ План';
        if (isHabits) {
            renderHabits();
            renderPlan();
        } else {
            renderPlans();
        }
    }

    function refreshAll() {
        renderHabits();
        renderPlan();
        renderPlans();
    }

    // Логика периода (вынесена в scope IIFE, чтобы openModal могла её вызывать)
    function setPeriod(value) {
        value = Math.min(Math.max(parseInt(value, 10) || DEFAULT_PERIOD, 1), 365);
        const slider = $('#periodSlider');
        const presets = $$('#periodPresets .preset-btn');
        if (slider) slider.value = value;
        $('#habitPeriod').value = value;
        $('#periodCustomDaysInline').value = value;
        $('#periodDisplay .period-value').textContent = formatPeriod(value);
        $('#periodDisplay .period-label').textContent = 'изменить';
        if (presets.length) {
            presets.forEach(btn => {
                btn.removeAttribute('data-selected');
                if (parseInt(btn.dataset.days, 10) === value) {
                    btn.setAttribute('data-selected', 'true');
                }
            });
        }
    }

    function applyNoPeriodState() {
        const on = !!($('#habitNoPeriod') && $('#habitNoPeriod').checked);
        const group = $('#periodGroup');
        if (group) group.classList.toggle('no-period-active', on);
        if (on) {
            const value = parseInt($('#habitPeriod').value, 10) || DEFAULT_PERIOD;
            const slider = $('#periodSlider');
            if (slider) slider.value = value;
        }
        const display = $('#periodDisplay');
        if (display) {
            display.querySelector('.period-value').textContent = on ? 'Без периода' : formatPeriod(parseInt($('#habitPeriod').value, 10) || DEFAULT_PERIOD);
            display.querySelector('.period-label').textContent = on ? 'задача на один день' : 'изменить';
        }
    }

    function updateReminderDisplay() {
        const value = $('#reminderValue');
        const label = $('#reminderLabel');
        if (!value || !label) return;
        if (reminderTimeCurrent) {
            value.textContent = reminderTimeCurrent;
            label.textContent = 'изменить';
        } else {
            value.textContent = 'Выбрать время';
            label.textContent = '';
        }
    }

    function parseTimeStr(str) {
        const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec((str || '').trim());
        if (!m) return null;
        return { h: parseInt(m[1], 10), m: parseInt(m[2], 10) };
    }

    function pad2(n) { return String(n).padStart(2, '0'); }

    function ensureWheelBuilt() {
        const hours = $('#wheelHours');
        const minutes = $('#wheelMinutes');
        if (!hours || !minutes) return;
        if (hours.childElementCount > 0) return;

        hours.innerHTML = '';
        minutes.innerHTML = '';
        for (let h = 0; h < 24; h++) {
            const item = document.createElement('div');
            item.className = 'wheel-item';
            item.dataset.value = h;
            item.textContent = pad2(h);
            hours.appendChild(item);
        }
        for (let m = 0; m < 60; m++) {
            const item = document.createElement('div');
            item.className = 'wheel-item';
            item.dataset.value = m;
            item.textContent = pad2(m);
            minutes.appendChild(item);
        }
    }

    function wheelScrollTo(col, index) {
        const itemH = 44;
        col.scrollTop = index * itemH;
    }

    function syncWheelToDraft() {
        const t = parseTimeStr(reminderTimeDraft) || { h: 9, m: 0 };
        const hours = $('#wheelHours');
        const minutes = $('#wheelMinutes');
        if (hours) wheelScrollTo(hours, t.h);
        if (minutes) wheelScrollTo(minutes, t.m);
        markWheelSelection();
    }

    function markWheelSelection() {
        const t = parseTimeStr(reminderTimeDraft) || { h: 9, m: 0 };
        [['#wheelHours', t.h], ['#wheelMinutes', t.m]].forEach(([sel, val]) => {
            const col = $(sel);
            if (!col) return;
            Array.from(col.children).forEach(item => {
                item.classList.toggle('selected', parseInt(item.dataset.value, 10) === val);
            });
        });
    }

    function syncDraftFromWheel(col) {
        const itemH = 44;
        const index = Math.max(0, Math.min(Math.round(col.scrollTop / itemH), col.childElementCount - 1));
        const val = parseInt(col.children[index]?.dataset.value, 10);
        if (isNaN(val)) return;
        const t = parseTimeStr(reminderTimeDraft) || { h: 9, m: 0 };
        reminderTimeDraft = col.id === 'wheelHours'
            ? `${pad2(val)}:${pad2(t.m)}`
            : `${pad2(t.h)}:${pad2(val)}`;
        markWheelSelection();
        $('#timeManual').value = reminderTimeDraft;
        $('#timeError').hidden = true;
    }

    function openTimePicker() {
        const overlay = $('#timeInputOverlay');
        if (!overlay) return;
        reminderTimeDraft = reminderTimeCurrent || '09:00';
        ensureWheelBuilt();
        const manual = $('#timeManual');
        manual.value = reminderTimeDraft;
        $('#timeError').hidden = true;
        $$('#timePresets .time-preset').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.time === reminderTimeDraft);
        });
        syncWheelToDraft();
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
        setTimeout(() => manual.focus(), 100);
    }

    function closeTimePicker() {
        $('#timeInputOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        updateBackButton();
    }

    function openPeriodInput() {        const field = $('#periodCustomDays');
        const overlay = $('#periodInputOverlay');
        if (!field || !overlay) return;
        field.value = $('#habitPeriod').value;
        field.min = 1;
        field.max = 365;
        updatePeriodCustomResult();
        overlay.classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
        setTimeout(() => field.focus(), 100);
    }

    function closePeriodInput() {
        $('#periodInputOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        updateBackButton();
    }

    function updatePeriodCustomResult() {
        const field = $('#periodCustomDays');
        const result = $('#periodCustomResult');
        if (!field || !result) return;
        const v = parseInt(field.value, 10);
        if (!v || v < 1 || v > 365) {
            result.textContent = v ? 'Максимум 365 дней' : '';
            return;
        }
        result.textContent = 'Это: ' + formatPeriod(v);
    }

    function openModal(habitId) {
        editingId = habitId || null;
        const modal = $('#modalOverlay');
        const title = $('#modalTitle');
        const submitBtn = $('#submitBtn');

        if (editingId) {
            const habit = habits.find(h => h.id === editingId);
            if (!habit) return;
            userEditedName = true; // При редактировании не меняем название автоматически
            title.textContent = 'Редактировать задачу';
            submitBtn.textContent = 'Сохранить';
            $('#habitName').value = habit.name;
            $('#habitId').value = habit.id;

            const presetBtns = $$('.emoji-btn');
            const hasPreset = Array.from(presetBtns).some(btn => btn.dataset.emoji === habit.emoji);
            presetBtns.forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.emoji === habit.emoji);
            });
            $('#customEmoji').value = hasPreset ? '' : habit.emoji;
            $$('.color-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.color === habit.color);
            });
            $('#periodSlider').value = habit.periodDays || DEFAULT_PERIOD;
            setPeriod(habit.periodDays || DEFAULT_PERIOD);
            $('#habitNoPeriod').checked = isPeriodless(habit);
            applyNoPeriodState();
            reminderTimeCurrent = habit.reminderTime || null;
        } else {
            userEditedName = false;
            title.textContent = 'Новая задача';
            submitBtn.textContent = 'Добавить';
            $('#habitForm').reset();
            $('#habitId').value = '';
            $$('.emoji-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            $('.no-emoji-btn').classList.add('selected');
            $('#customEmoji').value = '';
            $$('.color-btn').forEach((btn, i) => {
                btn.classList.toggle('selected', i === 0);
            });
            setPeriod(30);
            $('#habitNoPeriod').checked = false;
            applyNoPeriodState();
            reminderTimeCurrent = null;
        }

        updateReminderDisplay();
        $('#nameError').hidden = true;
        modal.classList.add('active');
        document.body.classList.add('modal-open');
        updateBackButton();
        setTimeout(() => $('#habitName').focus(), 100);
    }

    function closeModal() {
        $('#modalOverlay').classList.remove('active');
        document.body.classList.remove('modal-open');
        editingId = null;
        updateBackButton();
    }

    function buildPlanRow(container, item, t) {
        const start = container.startDate;
        const end = Array.isArray(container.items)
            ? addDays(start, Math.min(Math.max(parseInt(item.periodDays, 10) || DEFAULT_PERIOD, 1), 365) - 1)
            : endDateOf(container);
        const color = container.color;

        let doneDays = 0;
        for (let d = start; d <= end; d = addDays(d, 1)) {
            if (isItemDayDone(container, item, d)) doneDays++;
        }

        const row = document.createElement('div');
        row.className = 'plan-row';

        const label = document.createElement('div');
        label.className = 'plan-label';
        label.innerHTML = `
            <span class="plan-name" title="${escapeHtml(item.name)}">${item.emoji} ${escapeHtml(item.name)}</span>
            <span class="plan-dates">до ${formatShort(end)}</span>
        `;

        const cells = document.createElement('div');
        cells.className = 'plan-cells';

        let i = 0;
        for (let d = start; d <= end; d = addDays(d, 1)) {
            const count = getCompletionCount(container, item, d);
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'plan-cell';

            if (count > 0) {
                cell.classList.add('done');
                cell.style.background = color;
            }

            if (d === t) cell.classList.add('today');
            else if (d > t) cell.classList.add('future');
            if (i % 7 === 6) cell.classList.add('week-end');

            cell.textContent = parseInt(d.slice(8, 10), 10);
            cell.title = `${formatShort(d)} — ${count > 0 ? '✓' : '—'}`;

            cell.addEventListener('click', () => {
                const wasDone = isItemDayDone(container, item, d);
                if (Array.isArray(container.items)) {
                    const plan = plans.find(p => p.id === container.id);
                    if (!plan) return;
                    togglePlanItemOnDate(plan, item.id, d);
                    savePlans();
                } else {
                    toggleHabitOnDate(container, d);
                    save();
                }
                const nowDone = isItemDayDone(container, item, d);
                logCompletion(container, item, d, wasDone, nowDone);
                refreshAll();
            });

            cells.appendChild(cell);
            i++;
        }

        row.appendChild(label);
        row.appendChild(cells);
        return row;
    }

    function renderPlan() {
        const plan = $('#plan');
        plan.innerHTML = '';

        const t = today();
        let hasContent = false;

        plans.forEach(p => {
            hasContent = true;
            const group = document.createElement('div');
            group.className = 'plan-grid-group';
            group.style.setProperty('--habit-color', p.color);

            const head = document.createElement('div');
            head.className = 'plan-grid-head';
            const gridPct = planProgressPct(p);
            const gridPctText = gridPct === null ? '—' : `${gridPct}%`;
            head.innerHTML = `
                <span class="plan-name">${p.emoji} ${escapeHtml(p.name)}</span>
                <span class="habit-pct" title="Общий прогресс плана">${gridPctText}</span>
                <span class="plan-dates">до ${formatShort(planEndDateOf(p))}</span>
            `;
            group.appendChild(head);

            p.items.forEach(item => {
                group.appendChild(buildPlanRow(p, item, t));
            });

            plan.appendChild(group);
        });

        habits.forEach(habit => {
            if (isPeriodless(habit)) return;
            hasContent = true;
            plan.appendChild(buildPlanRow(habit, habit, t));
        });

        if (!hasContent) {
            const empty = document.createElement('div');
            empty.className = 'empty-state plan-empty';
            empty.innerHTML = `
                <button type="button" class="empty-icon" title="Создать план" aria-label="Создать план">📅</button>
                <p>Добавьте задачи с периодом или создайте план</p>
            `;
            empty.querySelector('.empty-icon').addEventListener('click', () => openPlanModal());
            plan.appendChild(empty);
        }
    }

    function init() {
        if (tg) {
            try {
                tg.ready();
                tg.expand();
                tg.onEvent('themeChanged', () => {
                    if (!localStorage.getItem(THEME_KEY)) {
                        applyTheme(tg.colorScheme === 'dark');
                    }
                });
                if (tg.BackButton) {
                    tg.BackButton.onClick(() => closeTopLayer());
                }
            } catch {
                /* работаем без Telegram API */
            }
        }

        initTheme();
        load();
        loadLifetime();
        loadPlans();
        loadStats();
        loadHistory();
        loadSettings();
        purgeDonePeriodlessHabits();
        fetchState(); // подтянуть отметки «выполнено» из бота (кнопка в Telegram) и смержить

        $('#currentDate').textContent = formatDate(new Date());

        renderHabits();
        renderPlan();

        $('#addHabitBtn').addEventListener('click', () => {
            if (activeTab === 'plans') openPlanModal();
            else openModal();
        });
        $('#modalClose').addEventListener('click', closeModal);
        $('#modalOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });

        $('#themeToggle').addEventListener('click', toggleTheme);

        $$('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('selected')) {
                    $$('.emoji-btn').forEach(b => b.classList.remove('selected'));
                    $('.no-emoji-btn').classList.add('selected');
                    $('#customEmoji').value = '';
                    return;
                }
                $$('.emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                $('#customEmoji').value = '';
                if (btn.dataset.emoji) applyEmojiName(btn.dataset.emoji);
            });
        });

        $('#customEmoji').addEventListener('input', () => {
            const input = $('#customEmoji');
            input.value = normalizeEmoji(input.value);
            const emoji = input.value.trim();
            if (emoji) {
                syncPresetSelection(emoji);
                applyEmojiName(emoji);
            }
        });

        $$('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.color-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        // ==== Табы ====
        $$('.tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });

        // ==== Список планов (делегирование) ====
        $('#plansList').addEventListener('click', (e) => {
            const addItemBtn = e.target.closest('.plan-add-item');
            if (addItemBtn) {
                openItemModal(addItemBtn.dataset.addItem);
                return;
            }
            const checkBtn = e.target.closest('.plan-item-check');
            if (checkBtn) {
                togglePlanItem(plans.find(p => p.id === checkBtn.dataset.plan), checkBtn.dataset.item);
                return;
            }
            const upBtn = e.target.closest('.plan-item-up');
            if (upBtn) {
                movePlanItem(upBtn.dataset.plan, upBtn.dataset.item, -1);
                return;
            }
            const downBtn = e.target.closest('.plan-item-down');
            if (downBtn) {
                movePlanItem(downBtn.dataset.plan, downBtn.dataset.item, 1);
                return;
            }
            const removeBtn = e.target.closest('.plan-item-remove');
            if (removeBtn) {
                removePlanItem(removeBtn.dataset.plan, removeBtn.dataset.item);
                return;
            }
            const extractBtn = e.target.closest('.plan-item-extract');
            if (extractBtn) {
                movePlanItemToHabit(extractBtn.dataset.plan, extractBtn.dataset.item);
                return;
            }
            const editItemBtn = e.target.closest('.plan-item-edit');
            if (editItemBtn) {
                openItemModal(editItemBtn.dataset.plan, editItemBtn.dataset.item);
                return;
            }
            const editBtn = e.target.closest('.plan-card-edit');
            if (editBtn) {
                openPlanModal(editBtn.dataset.plan);
                return;
            }
            const delBtn = e.target.closest('.plan-card-delete');
            if (delBtn) {
                deletePlan(delBtn.dataset.plan);
                return;
            }
        });

        // ==== Модалка плана ====
        $('#addPlanBtn').addEventListener('click', () => openPlanModal());
        $('#planModalClose').addEventListener('click', closePlanModal);
        $('#planModalOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closePlanModal();
        });

        $$('#planEmojiPicker .p-emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#planEmojiPicker .p-emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                $('#planCustomEmoji').value = '';
                applyPlanEmojiName(btn.dataset.emoji);
            });
        });

        $('#planCustomEmoji').addEventListener('input', () => {
            const input = $('#planCustomEmoji');
            input.value = normalizeEmoji(input.value);
            const emoji = input.value.trim();
            if (emoji) {
                $$('#planEmojiPicker .p-emoji-btn').forEach(b => {
                    b.classList.toggle('selected', emojiKey(b.dataset.emoji) === emojiKey(emoji));
                });
                applyPlanEmojiName(emoji);
            }
        });

        $$('#planColorPicker .p-color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#planColorPicker .p-color-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        $('#planPeriodDisplay').addEventListener('click', () => {
            $('#planPeriodDaysInput').focus();
            $('#planPeriodDaysInput').select();
        });
        $('#planPeriodDaysInput').addEventListener('input', () => {
            const v = parseInt($('#planPeriodDaysInput').value, 10);
            if (v && v >= 1 && v <= 365) setPlanPeriod(v);
        });
        $$('#planPeriodPresets .preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setPlanPeriod(btn.dataset.days);
            });
        });
        $('#planName').addEventListener('input', () => {
            if ($('#planName').value.trim()) planUserEditedName = true;
            $('#planNameError').hidden = true;
        });
        $('#planForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = $('#planName').value.trim();
            if (!name) {
                $('#planNameError').hidden = false;
                $('#planName').focus();
                return;
            }
            const emoji = getSelectedPlanEmoji();
            const color = $('#planColorPicker .p-color-btn.selected')?.dataset.color || '#22a2f0';
            const periodDays = Math.min(Math.max(
                parseInt($('#planPeriod').value, 10) || DEFAULT_PERIOD, 1, 365
            ), 365);
            if (editingPlanId) {
                updatePlan(editingPlanId, name, emoji, color, periodDays);
            } else {
                createPlan(name, emoji, color, periodDays);
            }
            closePlanModal();
        });

        // ==== Модалка задачи в плане ====
        $('#itemModalClose').addEventListener('click', closeItemModal);
        $('#itemModalOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeItemModal();
        });
        $$('.i-emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (btn.classList.contains('selected')) {
                    $$('.i-emoji-btn').forEach(b => b.classList.remove('selected'));
                    $('.i-emoji-btn.no-emoji-btn').classList.add('selected');
                    $('#itemCustomEmoji').value = '';
                    return;
                }
                $$('.i-emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                $('#itemCustomEmoji').value = '';
                if (btn.dataset.emoji) applyItemEmojiName(btn.dataset.emoji);
            });
        });
        $('#itemCustomEmoji').addEventListener('input', () => {
            const input = $('#itemCustomEmoji');
            input.value = normalizeEmoji(input.value);
            const emoji = input.value.trim();
            if (emoji) {
                $$('.i-emoji-btn').forEach(b => {
                    b.classList.toggle('selected', emojiKey(b.dataset.emoji) === emojiKey(emoji));
                });
                applyItemEmojiName(emoji);
            }
        });
        $('#itemName').addEventListener('input', () => {
            if ($('#itemName').value.trim()) itemUserEditedName = true;
            $('#itemNameError').hidden = true;
        });
        $$('#itemPeriodPresets .preset-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setItemPeriod(btn.dataset.days);
            });
        });
        $('#itemPeriodDays').addEventListener('input', () => {
            const v = parseInt($('#itemPeriodDays').value, 10);
            if (v && v >= 1 && v <= 365) setItemPeriod(v);
        });
        $('#itemForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const name = $('#itemName').value.trim();
            if (!name) {
                $('#itemNameError').hidden = false;
                $('#itemName').focus();
                return;
            }
            const emoji = getSelectedItemEmoji();
            const periodDays = Math.min(Math.max(
                parseInt($('#itemPeriodDays').value, 10) || DEFAULT_PERIOD, 1, 365
            ), 365);
            if (editingItemId) {
                updatePlanItem($('#itemPlanId').value, editingItemId, name, emoji, periodDays);
            } else {
                addPlanItem($('#itemPlanId').value, name, emoji, periodDays);
            }
            closeItemModal();
        });

        // Оверлей выбора плана: клик мимо плана — отмена
        $('#moveOverlay').addEventListener('click', (e) => {
            if (e.target === $('#moveOverlay')) closeMoveToPlanDialog();
        });

        // Клики по плашкам статистики
        $('#statTotalCard').addEventListener('click', openHistoryModal);
        $('#statTodayCard').addEventListener('click', focusTodaySection);
        $('#statTotalCard').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openHistoryModal(); }
        });
        $('#statTodayCard').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusTodaySection(); }
        });

        // Модалка истории
        $('#historyClose').addEventListener('click', closeHistoryModal);
        $('#historyOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeHistoryModal();
        });

        // Обработчики периода (логика вынесена в scope IIFE — setPeriod и т.д.)
        const periodSlider = $('#periodSlider');
        const periodPresets = $$('#periodPresets .preset-btn');
        const periodOverlay = $('#periodInputOverlay');
        const periodCustomField = $('#periodCustomDays');
        const periodCustomResult = $('#periodCustomResult');
        const periodCustomFieldInline = $('#periodCustomDaysInline');

        periodSlider.addEventListener('input', (e) => {
            setPeriod(nearestStep(e.target.value));
        });

        periodPresets.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                setPeriod(btn.dataset.days);
            });
        });

        $('#periodDisplay').addEventListener('click', openPeriodInput);
        $('#periodDisplay').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openPeriodInput();
            }
        });

        periodCustomField.addEventListener('input', updatePeriodCustomResult);
        // Обработчик для inline поля кастомного периода (как в планах)
        periodCustomFieldInline.addEventListener('input', () => {
            const v = parseInt(periodCustomFieldInline.value, 10);
            if (v && v >= 1 && v <= 365) setPeriod(v);
        });

        $('#habitNoPeriod').addEventListener('change', applyNoPeriodState);

        // Обработчики напоминания (таймпикер)
        const reminderDisplay = $('#reminderDisplay');
        const timeOverlay = $('#timeInputOverlay');
        const wheelHours = $('#wheelHours');
        const wheelMinutes = $('#wheelMinutes');
        const manualTime = $('#timeManual');
        const timeError = $('#timeError');

        ensureWheelBuilt();

        let wheelTimer = null;
        function onWheelScroll() {
            const col = this;
            clearTimeout(wheelTimer);
            wheelTimer = setTimeout(() => syncDraftFromWheel(col), 90);
        }
        wheelHours?.addEventListener('scroll', onWheelScroll);
        wheelMinutes?.addEventListener('scroll', onWheelScroll);

        if (reminderDisplay) {
            reminderDisplay.addEventListener('click', openTimePicker);
            reminderDisplay.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openTimePicker();
                }
            });
        }

        $$('#timePresets .time-preset').forEach(btn => {
            btn.addEventListener('click', () => {
                reminderTimeDraft = btn.dataset.time;
                manualTime.value = reminderTimeDraft;
                timeError.hidden = true;
                $$('#timePresets .time-preset').forEach(b => b.classList.toggle('selected', b === btn));
                syncWheelToDraft();
            });
        });

        manualTime?.addEventListener('input', () => {
            const t = parseTimeStr(manualTime.value);
            if (t) {
                reminderTimeDraft = `${pad2(t.h)}:${pad2(t.m)}`;
                timeError.hidden = true;
                $$('#timePresets .time-preset').forEach(b => b.classList.toggle('selected', b.dataset.time === reminderTimeDraft));
                syncWheelToDraft();
            } else {
                timeError.hidden = manualTime.value.trim() === '';
            }
        });

        $('#timeOk')?.addEventListener('click', () => {
            const t = parseTimeStr(manualTime.value);
            if (manualTime.value.trim() && !t) {
                timeError.hidden = false;
                return;
            }
            reminderTimeCurrent = t ? `${pad2(t.h)}:${pad2(t.m)}` : null;
            closeTimePicker();
            updateReminderDisplay();
        });

        $('#timeCancel')?.addEventListener('click', closeTimePicker);
        $('#timeInputClose')?.addEventListener('click', closeTimePicker);
        $('#timeClear')?.addEventListener('click', () => {
            reminderTimeCurrent = null;
            closeTimePicker();
            updateReminderDisplay();
        });
        timeOverlay?.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeTimePicker();
        });

        $('#periodCustomOk').addEventListener('click', () => {
            const v = parseInt(periodCustomField.value, 10);
            if (!v || v < 1 || v > 365) return;
            setPeriod(v);
            closePeriodInput();
        });

        $('#periodCustomCancel').addEventListener('click', closePeriodInput);
        periodOverlay.addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closePeriodInput();
        });

        $('#habitName').addEventListener('input', () => {
            if ($('#habitName').value.trim()) {
                userEditedName = true; // Пользователь вводит название вручную
            }
            $('#nameError').hidden = true;
        });

        $('#confirmOk').addEventListener('click', () => resolveConfirm(true));
        $('#confirmCancel').addEventListener('click', () => resolveConfirm(false));
        $('#confirmOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) resolveConfirm(false);
        });

        $('#habitForm').addEventListener('submit', (e) => {
            e.preventDefault();

            const name = $('#habitName').value.trim();
            const emoji = getSelectedEmoji();
            const color = $('.color-btn.selected')?.dataset.color || '#22a2f0';
            const periodDays = $('#habitNoPeriod').checked
                ? null
                : Math.min(Math.max(parseInt($('#habitPeriod').value, 10) || DEFAULT_PERIOD, 1, 365), 365);

            if (!name) {
                $('#nameError').hidden = false;
                $('#habitName').focus();
                return;
            }

            if (editingId) {
                updateHabit(editingId, name, emoji, color, periodDays, reminderTimeCurrent);
            } else {
                addHabit(name, emoji, color, periodDays, reminderTimeCurrent);
            }

            closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeTopLayer();
        });

        // Первичная синхронизация напоминаний (если есть задачи с напоминанием)
        setTimeout(syncRemindersToBackend, 2500);
        setTimeout(fetchState, 3000);

        // Приветственное окно для новых пользователей
        $('#welcomeStart').addEventListener('click', hideWelcome);
        setTimeout(showWelcome, 50);
    }

    function closeTopLayer() {
        if (isWelcomeVisible()) {
            hideWelcome();
            return;
        }
        if ($('#confirmOverlay').classList.contains('active')) {
            resolveConfirm(false);
            return;
        }
        if (!$('#moveOverlay').hidden) {
            closeMoveToPlanDialog();
            return;
        }
        if ($('#periodInputOverlay').classList.contains('active')) {
            closePeriodInput();
            return;
        }
        if ($('#timeInputOverlay').classList.contains('active')) {
            closeTimePicker();
            return;
        }
        if ($('#planModalOverlay').classList.contains('active')) {
            closePlanModal();
            return;
        }
        if ($('#itemModalOverlay').classList.contains('active')) {
            closeItemModal();
            return;
        }
        if ($('#historyOverlay').classList.contains('active')) {
            closeHistoryModal();
            return;
        }
        if ($('#modalOverlay').classList.contains('active')) {
            closeModal();
        }
    }

        // ===================== Серверная синхронизация (вариант B, v9) =====================
    // ⚠️⚠️ КОДЕР (opencode/rragulin): ЭТОТ СЛОЙ НЕ УДАЛЯТЬ И НЕ ВОЗВРАЩАТЬ CloudStorage!
    // Заменён бот-агентом 09.09.2026 (шаг 2 варианта B, по команде пользователя). Причина:
    // Telegram CloudStorage (вариант A, ключи v1.*) НЕ работает в Telegram Desktop -> на каждом
    // устройстве был пустой кеш. Теперь данные зеркалятся на worker (/api/data, KV snap:<user_id>)
    // и работают из любого клиента. Конфликт: last-write-wins по updatedAt (клиентские часы).
    // Перед удалением/переделкой — согласуй с пользователем (это его явный заказ).
    const DATA_ENDPOINT = 'https://veyo-reminders.okhotinandrei5.workers.dev/api/data';
    const SYNC_LOCAL_KEYS = [STORAGE_KEY, THEME_KEY, PLANS_KEY, LIFETIME_KEY, HISTORY_KEY, SETTINGS_KEY, STATS_KEY, WELCOME_KEY];
    const SYNC_META_KEY = 'habit-tracker-sync'; // { updatedAt: <ms> } — когда локально меняли в последний раз
    const SYNC_PUSH_DEBOUNCE_MS = 1500;
    const SYNC_FETCH_TIMEOUT_MS = 4000;
    let syncTimer = null;
    let syncFlushing = false;
    let syncDirty = false;

    function syncUser() {
        const u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
        return (u && u.id && tg.initData) ? { id: String(u.id), initData: tg.initData } : null;
    }

    function readSyncMeta() {
        try {
            const raw = localStorage.getItem(SYNC_META_KEY);
            if (!raw) return { updatedAt: 0 };
            const p = JSON.parse(raw);
            return { updatedAt: (typeof p.updatedAt === 'number' && p.updatedAt) || 0 };
        } catch { return { updatedAt: 0 }; }
    }

    function writeSyncMeta(updatedAt) {
        try { localStorage.setItem(SYNC_META_KEY, JSON.stringify({ updatedAt })); } catch {}
    }

    function hasAnyLocalData() {
        return SYNC_LOCAL_KEYS.some(k => localStorage.getItem(k) !== null);
    }

    // все ключи состояния одним объектом { key: value } (сервер хранит как строку — «тупое зеркало»)
    function collectLocalData() {
        const out = {};
        SYNC_LOCAL_KEYS.forEach(k => {
            const v = localStorage.getItem(k);
            if (v !== null) out[k] = v;
        });
        return JSON.stringify(out);
    }

    // серверные данные -> localStorage (возвращает true, если применилось)
    function applyServerData(dataStr) {
        try {
            const obj = JSON.parse(dataStr);
            if (!obj || typeof obj !== 'object') return false;
            Object.keys(obj).forEach(k => {
                try { localStorage.setItem(k, String(obj[k])); } catch {}
            });
            return true;
        } catch { return false; }
    }

    // после применения серверных данных перечитываем localStorage и перерисовываем UI
    function reRenderAfterSync() {
        try {
            load();
            loadLifetime();
            loadPlans();
            loadStats();
            loadHistory();
            loadSettings();
            renderHabits();
            renderPlan();
            maybeWelcomeAfterSync(); // данные пришли с сервера — приветствие больше не нужно
        } catch {}
    }

    async function fetchJson(url, options, timeoutMs) {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            const resp = await fetch(url, Object.assign({}, options, { signal: ctrl.signal }));
            if (!resp.ok) return null;
            return await resp.json();
        } catch { return null; } finally { clearTimeout(t); }
    }

    // pull при старте: сервер новее -> применяем; локально новее -> пушим; сервер пуст + локально есть -> миграция
    async function syncPull() {
        const user = syncUser();
        if (!user) return;
        const res = await fetchJson(DATA_ENDPOINT + '?initData=' + encodeURIComponent(user.initData), { method: 'GET' }, SYNC_FETCH_TIMEOUT_MS);
        if (!res || res.ok !== true) return; // вне сети / бэкенд недоступен — остаёмся на локальном кеше
        const localUpdatedAt = readSyncMeta().updatedAt;
        const serverUpdatedAt = (typeof res.updatedAt === 'number' && res.updatedAt) || 0;

        if (!serverUpdatedAt) {
            if (hasAnyLocalData()) { // локальные данные впервые -> заливаем на сервер
                writeSyncMeta(Date.now());
                scheduleSyncFlush(300);
            }
            return;
        }
        if (serverUpdatedAt > localUpdatedAt) {
            if (applyServerData(res.data)) {
                writeSyncMeta(serverUpdatedAt);
                reRenderAfterSync();
            }
        } else if (serverUpdatedAt < localUpdatedAt) {
            scheduleSyncFlush(0); // локально новее — пушим
        }
        // equal — уже синхронизировано
    }

    // вызывается из save/saveStats/saveSettings/saveHistory/savePlans/toggleTheme (см. cloudQueue(ключ) выше)
    function cloudQueue() {
        if (!syncUser()) return; // вне Telegram — чисто локально
        writeSyncMeta(Date.now()); // метка момента локального изменения (для LWW)
        scheduleSyncFlush(SYNC_PUSH_DEBOUNCE_MS);
    }

    function scheduleSyncFlush(delayMs) {
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(syncFlush, delayMs);
    }

    async function syncFlush() {
        syncTimer = null;
        if (syncFlushing) { syncDirty = true; return; }
        const user = syncUser();
        if (!user) return;
        syncFlushing = true;
        try {
            const updatedAt = readSyncMeta().updatedAt || Date.now();
            const res = await fetchJson(DATA_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ initData: user.initData, updatedAt: updatedAt, data: collectLocalData() })
            }, SYNC_FETCH_TIMEOUT_MS);
            if (res && res.ok === true && res.saved === false) {
                // сервер новее (писали с другого устройства) -> пересинхронизация
                await syncPull();
            }
        } catch {} finally {
            syncFlushing = false;
            if (syncDirty) { syncDirty = false; scheduleSyncFlush(300); }
        }
    }

    async function cloudBoot() {
        try { await syncPull(); } catch {}
    }

    // ⚠️ КОДЕР: init() сразу (UI из локального кеша, без ожидания сети), cloudBoot() — фоном
    document.addEventListener('DOMContentLoaded', () => {
        init();
        cloudBoot();
    });
})();

