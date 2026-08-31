(() => {
    'use strict';

    const STORAGE_KEY = 'habit-tracker-data';
    const THEME_KEY = 'habit-tracker-theme';

    const DEFAULT_PERIOD = 30;

    let habits = [];
    let editingId = null;
    let toastTimer = null;

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

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
        return addDays(habit.startDate, habit.periodDays - 1);
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
            h.goal = Math.min(Math.max(parseInt(h.goal, 10) || 1, 1), 100);
            h.periodDays = Math.min(Math.max(parseInt(h.periodDays, 10) || DEFAULT_PERIOD, 1), 365);
            if (typeof h.completions !== 'object' || h.completions === null || Array.isArray(h.completions)) {
                h.completions = {};
            }
            if (!h.emoji) h.emoji = '💧';
            if (!h.color) h.color = '#6c5ce7';
            if (!h.startDate) h.startDate = h.createdAt || today();
        });
    }

    function save() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
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
    }

    function initTheme() {
        const saved = localStorage.getItem(THEME_KEY);
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        applyTheme(saved ? saved === 'dark' : prefersDark);
    }

    function toggleTheme() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark');
        applyTheme(!isDark);
    }

    function getHabitCount(habit, date) {
        if (!habit.completions) return 0;
        return habit.completions[date] || 0;
    }

    function isCompletedToday(habit) {
        return getHabitCount(habit, today()) >= habit.goal;
    }

    function isDayComplete(date) {
        const ds = localDateStr(date);
        return habits.every(h => getHabitCount(h, ds) >= h.goal);
    }

    function calculateStreak() {
        if (habits.length === 0) return 0;

        let streak = 0;
        const d = new Date();

        if (!isDayComplete(d)) {
            d.setDate(d.getDate() - 1);
        }

        while (isDayComplete(d)) {
            streak++;
            d.setDate(d.getDate() - 1);
        }

        return streak;
    }

    function countDaysDone(habit) {
        const start = habit.startDate;
        const end = endDateOf(habit);
        return Object.entries(habit.completions || {}).reduce((acc, [d, c]) => {
            return d >= start && d <= end && c >= habit.goal ? acc + 1 : acc;
        }, 0);
    }

    function calculateStats() {
        const completed = habits.filter(h => isCompletedToday(h)).length;
        const total = habits.length;

        let totalCompletions = 0;
        let totalPeriodDays = 0;
        let donePeriodDays = 0;

        habits.forEach(h => {
            if (h.completions) {
                totalCompletions += Object.values(h.completions).reduce((a, b) => a + b, 0);
            }
            totalPeriodDays += h.periodDays;
            donePeriodDays += countDaysDone(h);
        });

        const rate = totalPeriodDays > 0 ? Math.round((donePeriodDays / totalPeriodDays) * 100) : 0;

        $('#statStreak').textContent = calculateStreak();
        $('#statToday').textContent = `${completed}/${total}`;
        $('#statTotal').textContent = totalCompletions;
        $('#statRate').textContent = total > 0 ? `${rate}%` : '—';
        $('#dayProgress').textContent = total > 0 ? `${rate}% за период` : '';
    }

    function createEmptyState() {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.id = 'emptyState';
        div.innerHTML = `
            <span class="empty-icon">📋</span>
            <p>Добавьте первую привычку, чтобы начать отслеживание</p>
        `;
        return div;
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function renderHabits() {
        const list = $('#habitsList');
        list.innerHTML = '';

        if (habits.length === 0) {
            list.appendChild(createEmptyState());
            calculateStats();
            return;
        }

        const t = today();

        habits.forEach((habit, index) => {
            const count = getHabitCount(habit, t);
            const done = count >= habit.goal;
            const progress = Math.min((count / habit.goal) * 100, 100);
            const end = endDateOf(habit);
            const inPeriod = t >= habit.startDate && t <= end;
            const finished = t > end;
            const remaining = Math.max(diffDays(t, end) + 1, 0);

            let status;
            if (finished) {
                status = `Период завершён — выполнено ${countDaysDone(habit)} из ${habit.periodDays} дней`;
            } else {
                status = `${count} / ${habit.goal} сегодня • осталось ${remaining} дн.`;
                if (done) status += ' — выполнено!';
            }

            const card = document.createElement('div');
            card.className = `habit-card${done ? ' completed' : ''}${finished ? ' finished' : ''}`;
            card.style.setProperty('--habit-color', habit.color);
            card.style.animationDelay = `${index * 0.05}s`;

            card.innerHTML = `
                <div class="habit-emoji">${habit.emoji}</div>
                <div class="habit-info">
                    <div class="habit-name">${escapeHtml(habit.name)}</div>
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
                    <button class="btn-edit" data-id="${habit.id}" title="Редактировать" aria-label="Редактировать">✏️</button>
                    <button class="btn-delete" data-id="${habit.id}" title="Удалить" aria-label="Удалить">🗑</button>
                </div>
            `;

            list.appendChild(card);
        });

        list.querySelectorAll('.btn-check').forEach(btn => {
            btn.addEventListener('click', () => toggleHabit(btn.dataset.id));
        });

        list.querySelectorAll('.btn-edit').forEach(btn => {
            btn.addEventListener('click', () => openModal(btn.dataset.id));
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
        habit.completions[dateStr] = current >= habit.goal
            ? Math.max(habit.goal - 1, 0)
            : current + 1;
    }

    function toggleHabit(id) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;

        const t = today();
        if (t < habit.startDate || t > endDateOf(habit)) return;

        toggleHabitOnDate(habit, t);
        save();
        renderHabits();
        renderPlan();
    }

    function deleteHabit(id) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;

        if (!confirm(`Удалить привычку «${habit.name}»? Вся история по ней будет удалена.`)) return;

        habits = habits.filter(h => h.id !== id);
        save();
        renderHabits();
        renderPlan();
        showToast('Привычка удалена');
    }

    function addHabit(name, emoji, goal, color, periodDays) {
        habits.push({
            id: generateId(),
            name,
            emoji,
            goal,
            color,
            periodDays,
            startDate: today(),
            completions: {},
            createdAt: today()
        });
        save();
        renderHabits();
        renderPlan();
        showToast(`Привычка добавлена — период ${periodDays} дн.`);
    }

    function updateHabit(id, name, emoji, goal, color, periodDays) {
        const habit = habits.find(h => h.id === id);
        if (!habit) return;
        habit.name = name;
        habit.emoji = emoji;
        habit.goal = goal;
        habit.color = color;
        habit.periodDays = periodDays;
        save();
        renderHabits();
        renderPlan();
        showToast('Изменения сохранены');
    }

    function openModal(habitId) {
        editingId = habitId || null;
        const modal = $('#modalOverlay');
        const title = $('#modalTitle');
        const submitBtn = $('#submitBtn');

        if (editingId) {
            const habit = habits.find(h => h.id === editingId);
            if (!habit) return;
            title.textContent = 'Редактировать привычку';
            submitBtn.textContent = 'Сохранить';
            $('#habitName').value = habit.name;
            $('#habitGoal').value = habit.goal;
            $('#habitId').value = habit.id;

            $$('.emoji-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.emoji === habit.emoji);
            });
            $$('.color-btn').forEach(btn => {
                btn.classList.toggle('selected', btn.dataset.color === habit.color);
            });
            $$('.period-btn').forEach(btn => {
                btn.classList.toggle('selected', parseInt(btn.dataset.days, 10) === habit.periodDays);
            });
        } else {
            title.textContent = 'Новая привычка';
            submitBtn.textContent = 'Добавить';
            $('#habitForm').reset();
            $('#habitId').value = '';
            $$('.emoji-btn').forEach((btn, i) => {
                btn.classList.toggle('selected', i === 0);
            });
            $$('.color-btn').forEach((btn, i) => {
                btn.classList.toggle('selected', i === 0);
            });
            $$('.period-btn').forEach(btn => {
                btn.classList.toggle('selected', parseInt(btn.dataset.days, 10) === DEFAULT_PERIOD);
            });
        }

        $('#nameError').hidden = true;
        modal.classList.add('active');
        setTimeout(() => $('#habitName').focus(), 100);
    }

    function closeModal() {
        $('#modalOverlay').classList.remove('active');
        editingId = null;
    }

    function renderPlan() {
        const plan = $('#plan');
        plan.innerHTML = '';

        if (habits.length === 0) {
            plan.innerHTML = '<p style="color:var(--text-secondary);font-size:0.85rem;text-align:center;padding:16px;">Добавьте привычки, чтобы увидеть план на период</p>';
            return;
        }

        const t = today();

        habits.forEach(habit => {
            const start = habit.startDate;
            const end = endDateOf(habit);

            const row = document.createElement('div');
            row.className = 'plan-row';

            const label = document.createElement('div');
            label.className = 'plan-label';
            label.innerHTML = `
                <span class="plan-name" title="${escapeHtml(habit.name)}">${habit.emoji} ${escapeHtml(habit.name)}</span>
                <span class="plan-dates">до ${formatShort(end)} • ${countDaysDone(habit)}/${habit.periodDays} дн.</span>
            `;

            const cells = document.createElement('div');
            cells.className = 'plan-cells';

            let i = 0;
            for (let d = start; d <= end; d = addDays(d, 1)) {
                const count = getHabitCount(habit, d);
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'plan-cell';

                const ratio = habit.goal > 0 ? count / habit.goal : 0;
                if (ratio >= 1) {
                    cell.classList.add('done');
                    cell.style.background = habit.color;
                } else if (ratio > 0) {
                    cell.classList.add('partial');
                    cell.style.background = habit.color + '55';
                }

                if (d === t) cell.classList.add('today');
                else if (d > t) cell.classList.add('future');
                if (i % 7 === 6) cell.classList.add('week-end');

                cell.textContent = parseInt(d.slice(8, 10), 10);
                cell.title = `${formatShort(d)} — ${count}/${habit.goal}`;

                cell.addEventListener('click', () => {
                    toggleHabitOnDate(habit, d);
                    save();
                    renderHabits();
                    renderPlan();
                });

                cells.appendChild(cell);
                i++;
            }

            row.appendChild(label);
            row.appendChild(cells);
            plan.appendChild(row);
        });
    }

    function init() {
        initTheme();
        load();

        $('#currentDate').textContent = formatDate(new Date());

        renderHabits();
        renderPlan();

        $('#addHabitBtn').addEventListener('click', () => openModal());
        $('#modalClose').addEventListener('click', closeModal);
        $('#modalOverlay').addEventListener('click', (e) => {
            if (e.target === e.currentTarget) closeModal();
        });

        $('#themeToggle').addEventListener('click', toggleTheme);

        $$('.emoji-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.emoji-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        $$('.color-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.color-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        $$('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.period-btn').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            });
        });

        $('#habitName').addEventListener('input', () => {
            $('#nameError').hidden = true;
        });

        $('#habitForm').addEventListener('submit', (e) => {
            e.preventDefault();

            const name = $('#habitName').value.trim();
            const emoji = $('.emoji-btn.selected')?.dataset.emoji || '💧';
            const color = $('.color-btn.selected')?.dataset.color || '#6c5ce7';
            const goal = Math.min(Math.max(parseInt($('#habitGoal').value, 10) || 1, 1), 100);
            const periodDays = Math.min(Math.max(
                parseInt($('.period-btn.selected')?.dataset.days, 10) || DEFAULT_PERIOD, 1, 365
            ), 365);

            if (!name) {
                $('#nameError').hidden = false;
                $('#habitName').focus();
                return;
            }

            $('#habitGoal').value = goal;

            if (editingId) {
                updateHabit(editingId, name, emoji, goal, color, periodDays);
            } else {
                addHabit(name, emoji, goal, color, periodDays);
            }

            closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && $('#modalOverlay').classList.contains('active')) {
                closeModal();
            }
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
