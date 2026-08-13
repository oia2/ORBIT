(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const sessionStorageFallback = new Map();

  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return sessionStorageFallback.has(key) ? sessionStorageFallback.get(key) : fallback; }
    },
    set(key, value) {
      document.dispatchEvent(new CustomEvent('orbit:storage-state', { detail: { state: 'saving' } }));
      try {
        localStorage.setItem(key, JSON.stringify(value));
        setTimeout(() => document.dispatchEvent(new CustomEvent('orbit:storage-state', { detail: { state: 'saved' } })), 160);
        return true;
      } catch (error) {
        if (['SecurityError', 'NotAllowedError'].includes(error?.name)) {
          sessionStorageFallback.set(key, value);
          setTimeout(() => document.dispatchEvent(new CustomEvent('orbit:storage-state', { detail: { state: 'saved' } })), 160);
          return true;
        }
        document.dispatchEvent(new CustomEvent('orbit:storage-state', { detail: { state: 'error' } }));
        return false;
      }
    }
  };

  const DEMO_TODAY = '2026-05-20';
  const WEEK_DATES = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24'];
  const HABIT_SEED = {
    '2026-05-18': { water: true, stretch: true, silence: false, screen: true },
    '2026-05-19': { water: true, stretch: false, silence: true, screen: true },
    '2026-05-20': { water: true, stretch: true, silence: false, screen: false }
  };
  const DAY_RECORD_SEED = {
    '2026-05-18': { date: '2026-05-18', taskDone: 3, taskTotal: 6, habitDone: 2, habitTotal: 4, score: 48, state: null, finalized: true },
    '2026-05-19': { date: '2026-05-19', taskDone: 5, taskTotal: 5, habitDone: 3, habitTotal: 4, score: 69, state: null, finalized: true }
  };
  const formatMinutes = (minutes) => {
    const value = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(value / 60);
    const rest = value % 60;
    if (!hours) return `${rest} мин`;
    return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
  };
  const getHabitLog = () => ({ ...HABIT_SEED, ...storage.get('orbit-v2-habit-log', {}) });
  const getDayRecords = () => ({ ...DAY_RECORD_SEED, ...storage.get('orbit-v2-day-records', {}) });

  class OrbitField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.pointer = { x: .5, y: .5 };
      this.paused = reducedMotion;
      this.frame = 0;
      this.resize = this.resize.bind(this);
      this.draw = this.draw.bind(this);
      this.resizeObserver = new ResizeObserver(this.resize);
      this.resizeObserver.observe(canvas.parentElement);
      canvas.parentElement.addEventListener('pointermove', (event) => {
        const box = canvas.getBoundingClientRect();
        this.pointer.x = (event.clientX - box.left) / box.width;
        this.pointer.y = (event.clientY - box.top) / box.height;
      });
      canvas.parentElement.addEventListener('pointerleave', () => { this.pointer = { x: .5, y: .5 }; });
      this.resize();
      if (!reducedMotion) this.frame = requestAnimationFrame(this.draw);
    }

    resize() {
      const box = this.canvas.parentElement.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(1, Math.floor(box.width * ratio));
      this.canvas.height = Math.max(1, Math.floor(box.height * ratio));
      this.canvas.style.width = `${box.width}px`;
      this.canvas.style.height = `${box.height}px`;
      this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      this.width = box.width;
      this.height = box.height;
      if (reducedMotion || this.paused) this.draw(0);
    }

    setPaused(paused) {
      if (reducedMotion) return;
      this.paused = paused;
      if (paused) {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      } else if (!this.frame) {
        this.frame = requestAnimationFrame(this.draw);
      }
    }

    draw(now = 0) {
      this.frame = 0;
      const ctx = this.ctx;
      const w = this.width || 1;
      const h = this.height || 1;
      const css = getComputedStyle(document.documentElement);
      const accent = css.getPropertyValue('--accent').trim();
      const muted = css.getPropertyValue('--muted').trim();
      const time = now * .00018;
      const cx = w * (.5 + (this.pointer.x - .5) * .025);
      const cy = h * (.5 + (this.pointer.y - .5) * .025);
      const compact = w < 430;
      const symbols = ['·', '+', '/', '%', '°', '@'];

      ctx.clearRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${compact ? 9 : 10}px "Cascadia Code", monospace`;

      for (let ring = 0; ring < 4; ring += 1) {
        const count = compact ? 32 + ring * 8 : 46 + ring * 12;
        const rx = Math.min(w * (.18 + ring * .09), w * .46);
        const ry = Math.min(h * (.1 + ring * .055), h * .31);
        const tilt = -.28 + ring * .12;
        for (let index = 0; index < count; index += 1) {
          const phase = (index / count) * Math.PI * 2 + time * (ring % 2 ? -.72 : .5) + ring;
          const wave = Math.sin(phase * 3 + time * 4) * (4 + ring * 1.5);
          const x0 = Math.cos(phase) * (rx + wave);
          const y0 = Math.sin(phase) * (ry + wave * .25);
          const x = cx + x0 * Math.cos(tilt) - y0 * Math.sin(tilt);
          const y = cy + x0 * Math.sin(tilt) + y0 * Math.cos(tilt);
          ctx.globalAlpha = .08 + ((Math.sin(phase) + 1) / 2) * .28;
          ctx.fillStyle = ring === 1 && index % 7 === 0 ? accent : muted;
          ctx.fillText(symbols[(index + ring * 2) % symbols.length], x, y);
        }
      }

      ctx.globalAlpha = .16;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.min(w * .29, 190), Math.min(h * .17, 90), -.2 + Math.sin(time) * .04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (!reducedMotion && !this.paused) this.frame = requestAnimationFrame(this.draw);
    }
  }

  $$('.orbit-canvas').forEach((canvas) => { canvas.orbitField = new OrbitField(canvas); });
  $$('[data-toggle-orbit]').forEach((button) => button.addEventListener('click', () => {
    const field = $('.orbit-canvas', button.closest('.orbit-panel'))?.orbitField;
    if (!field) return;
    const paused = button.getAttribute('aria-pressed') !== 'true';
    field.setPaused(paused);
    button.setAttribute('aria-pressed', String(paused));
    button.textContent = paused ? 'Продолжить' : 'Пауза';
  }));

  const toast = $('#toast');
  let toastTimer;
  const showToast = (message, duration = 3400) => {
    if (!toast) return;
    const messageEl = $('#toast-message');
    if (messageEl) messageEl.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  };

  document.addEventListener('orbit:storage-state', (event) => {
    const state = event.detail?.state;
    document.body.classList.toggle('is-saving', state === 'saving');
    $$('.sync-state').forEach((status) => {
      status.classList.toggle('is-saving', state === 'saving');
      status.classList.toggle('is-error', state === 'error');
      status.setAttribute('aria-busy', String(state === 'saving'));
      const label = $('span', status);
      if (label) label.textContent = state === 'saving' ? 'Сохраняем…' : state === 'error' ? 'Не удалось сохранить' : 'Сохранено на устройстве';
    });
    if (state === 'error') showToast('Не удалось сохранить изменения. Проверьте доступ к хранилищу.');
  });

  const syncPressedStates = () => {
    $$('.habit-toggle, .habit-dot, .set-check, [data-energy], [data-mood]').forEach((control) => {
      const pressed = control.classList.contains('done') || control.classList.contains('active');
      control.setAttribute('aria-pressed', String(pressed));
    });
  };
  syncPressedStates();
  new MutationObserver(syncPressedStates).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
  $$('.calendar-day').forEach((button) => {
    if (button.hasAttribute('aria-label')) return;
    const month = button.classList.contains('is-outside') ? 'апреля' : 'мая';
    button.setAttribute('aria-label', `${button.dataset.day} ${month} 2026`);
  });

  document.addEventListener('invalid', (event) => {
    const field = event.target.closest('.field');
    if (!field) return;
    event.target.setAttribute('aria-invalid', 'true');
    field.classList.add('has-error');
    let error = $('.field-error', field);
    if (!error) {
      error = document.createElement('p');
      error.className = 'field-error';
      error.id = `${event.target.id || `field-${Date.now()}`}-error`;
      field.append(error);
    }
    const describedBy = new Set((event.target.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
    describedBy.add(error.id);
    event.target.setAttribute('aria-describedby', [...describedBy].join(' '));
    error.textContent = event.target.validity.valueMissing ? 'Заполните это поле.' : 'Проверьте введённое значение.';
  }, true);

  document.addEventListener('input', (event) => {
    if (!event.target.matches('input, select, textarea') || !event.target.validity?.valid) return;
    event.target.removeAttribute('aria-invalid');
    const field = event.target.closest('.field');
    if (!field) return;
    field.classList.remove('has-error');
    const error = $('.field-error', field);
    if (error) {
      const describedBy = (event.target.getAttribute('aria-describedby') || '').split(' ').filter((id) => id && id !== error.id);
      if (describedBy.length) event.target.setAttribute('aria-describedby', describedBy.join(' '));
      else event.target.removeAttribute('aria-describedby');
      error.remove();
    }
  }, true);

  const habitDefinitions = () => storage.get('orbit-v2-habit-definitions', []);
  const archivedHabitIds = () => new Set(storage.get('orbit-v2-habit-archived', []));
  const upsertHabitDefinition = (definition) => {
    const definitions = habitDefinitions();
    const index = definitions.findIndex((item) => item.id === definition.id);
    if (index >= 0) definitions[index] = { ...definitions[index], ...definition };
    else definitions.push(definition);
    storage.set('orbit-v2-habit-definitions', definitions);
  };
  const archiveHabitDefinition = (id) => {
    const archived = archivedHabitIds();
    archived.add(id);
    storage.set('orbit-v2-habit-archived', [...archived]);
  };
  const createHabitEditButton = (name) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'habit-edit';
    button.dataset.editHabit = '';
    button.setAttribute('aria-label', `Настроить привычку «${name}»`);
    button.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
    return button;
  };

  const setupHabitEditor = ({ onSave, onArchive }) => {
    const dialog = $('#habit-dialog');
    const form = $('#habit-form');
    if (!dialog || !form) return;
    const archiveButton = $('[data-archive-habit]', form);
    const submitButton = $('#habit-submit-button');
    let currentHabit = null;

    const openEditor = (habit = null) => {
      currentHabit = habit;
      $('#habit-dialog-mode').textContent = habit ? 'Настройка привычки' : 'Новая привычка';
      $('#habit-dialog-title').textContent = habit ? 'Изменить привычку' : 'Что хотите закрепить?';
      $('#habit-dialog-note').textContent = habit ? 'История выполнения сохранится после изменений.' : 'Выберите ритм, по которому привычка будет появляться в днях.';
      $('#habit-name-field').value = habit?.name || '';
      $('#habit-frequency-field').value = habit?.frequency || 'Каждый день';
      $('#habit-time-field').value = habit?.time || '';
      archiveButton.hidden = !habit;
      submitButton.textContent = habit ? 'Сохранить' : 'Добавить привычку';
      dialog.showModal();
      requestAnimationFrame(() => $('#habit-name-field').focus());
    };

    $$('[data-add-habit]').forEach((button) => button.addEventListener('click', () => openEditor()));
    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-edit-habit]');
      if (!trigger) return;
      const root = trigger.closest('.habit-row, .habit-line, [data-habit-id]');
      if (!root) return;
      const title = $('strong', root)?.textContent.trim() || 'Привычка';
      openEditor({ id: root.dataset.habitId, name: title, frequency: root.dataset.frequency || 'Каждый день', time: root.dataset.time || '' });
    });
    $$('[data-close-habit]').forEach((button) => button.addEventListener('click', () => { form.reset(); dialog.close(); }));
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = $('#habit-name-field').value.trim();
      if (!name) return;
      const definition = { id: currentHabit?.id || `habit-${Date.now()}`, name, frequency: $('#habit-frequency-field').value, time: $('#habit-time-field').value };
      const isNew = !currentHabit;
      upsertHabitDefinition(definition);
      onSave({ ...definition, isNew });
      form.reset();
      dialog.close();
      currentHabit = null;
      showToast(isNew ? 'Привычка добавлена в расписание' : 'Настройки привычки сохранены');
    });
    archiveButton.addEventListener('click', () => {
      if (!currentHabit) return;
      archiveHabitDefinition(currentHabit.id);
      onArchive(currentHabit);
      form.reset();
      dialog.close();
      currentHabit = null;
      showToast('Привычка удалена из плана · история сохранена');
    });
  };

  if (document.body.dataset.page === 'weekly') {
    const habitDots = () => $$('.habit-dot');
    const habitLog = getHabitLog();
    const weeklyHabitList = $('.habit-list', $('[data-od-id="weekly-habits-card"]'));
    const archived = archivedHabitIds();

    const enhanceWeeklyHabit = (line) => {
      if (line.querySelector('[data-edit-habit]')) return line;
      const title = $('strong', line)?.textContent.trim() || 'Привычка';
      line.append(createHabitEditButton(title));
      return line;
    };

    const createWeeklyHabit = (definition, bindDots = false) => {
      const line = document.createElement('div');
      line.className = 'habit-line';
      line.dataset.habitId = definition.id;
      line.dataset.frequency = definition.frequency || 'Каждый день';
      line.dataset.time = definition.time || '';
      const title = document.createElement('strong');
      title.textContent = definition.name;
      title.title = line.dataset.frequency;
      const days = document.createElement('div');
      days.className = 'habit-days';
      days.setAttribute('aria-label', `${definition.name}: выполнение по дням`);
      WEEK_DATES.forEach((date, index) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'habit-dot';
        dot.dataset.date = date;
        dot.dataset.habitId = definition.id;
        dot.setAttribute('aria-label', `День ${index + 1}`);
        if (bindDots) bindHabitDot(dot);
        days.append(dot);
      });
      line.append(title, days);
      enhanceWeeklyHabit(line);
      weeklyHabitList.append(line);
      return line;
    };

    $$('.habit-line[data-habit-id]').forEach((line) => {
      if (archived.has(line.dataset.habitId)) line.remove();
      else {
        line.dataset.frequency ||= 'Каждый день';
        line.dataset.time ||= '';
        enhanceWeeklyHabit(line);
      }
    });
    habitDefinitions().forEach((definition) => {
      if (archived.has(definition.id)) return;
      const existing = $(`.habit-line[data-habit-id="${definition.id}"]`);
      if (!existing) createWeeklyHabit(definition);
      else {
        existing.dataset.frequency = definition.frequency || 'Каждый день';
        existing.dataset.time = definition.time || '';
        $('strong', existing).textContent = definition.name;
        $('strong', existing).title = existing.dataset.frequency;
        $('[data-edit-habit]', existing).setAttribute('aria-label', `Настроить привычку «${definition.name}»`);
      }
    });

    $$('.habit-line[data-habit-id]').forEach((line) => {
      $$('.habit-dot', line).forEach((dot, index) => {
        const date = WEEK_DATES[index];
        dot.dataset.date = date;
        dot.dataset.habitId = line.dataset.habitId;
        dot.classList.toggle('done', Boolean(habitLog[date]?.[line.dataset.habitId]));
      });
    });

    const updateWeek = () => {
      const dots = habitDots();
      const habitsDone = dots.filter((dot) => dot.classList.contains('done')).length;
      const habitRatio = dots.length ? habitsDone / dots.length : 0;
      const liveTaskRecords = storage.get('orbit-v2-task-records', {});
      const storedDayRecords = getDayRecords();
      const weekTasks = Object.values(liveTaskRecords).filter((task) => WEEK_DATES.includes(task.date) && task.date >= DEMO_TODAY && !['cancelled', 'backlog'].includes(task.status));
      const pastRecords = WEEK_DATES.filter((date) => date < DEMO_TODAY).map((date) => storedDayRecords[date]).filter(Boolean);
      const pastDone = pastRecords.reduce((sum, record) => sum + Number(record.taskDone || 0), 0);
      const pastTotal = pastRecords.reduce((sum, record) => sum + Number(record.taskTotal || 0), 0);
      const tasksDone = pastDone + weekTasks.filter((task) => task.done).length;
      const tasksTotal = pastTotal + weekTasks.length;
      const taskRatio = tasksTotal ? tasksDone / tasksTotal : 0;
      const dayStates = WEEK_DATES.map((date) => storedDayRecords[date]?.state).filter(Boolean);
      const moodValues = { 'Сложно': 1, 'Ровно': 3, 'Хорошо': 5 };
      const stateRatio = dayStates.length ? dayStates.reduce((sum, state) => sum + (Number(state.energy || 0) / 5) * .45 + ((moodValues[state.mood] || 0) / 5) * .25 + Math.min(Number(state.sleep || 0) / 8, 1) * .3, 0) / dayStates.length : 0;
      const availableWeight = (tasksTotal ? 50 : 0) + (dots.length ? 30 : 0) + (dayStates.length ? 20 : 0);
      const score = availableWeight ? Math.round(((taskRatio * 50) + (habitRatio * 30) + (stateRatio * 20)) / availableWeight * 100) : 0;
      const usedLayers = [tasksTotal ? 'задачи' : '', dots.length ? 'привычки' : '', dayStates.length ? 'состояние' : ''].filter(Boolean);
      $('#week-progress').textContent = availableWeight ? `${score}%` : '—';
      $('#week-orbit-label').textContent = usedLayers.length ? `Итог · учитываются ${usedLayers.join(', ')}` : 'Итог · пока нет данных';
      $('#week-done').textContent = tasksDone;
      $('#week-total').textContent = tasksTotal;
      const tasksLeft = Math.max(0, tasksTotal - tasksDone);
      const taskPercent = tasksTotal ? Math.round(taskRatio * 100) : 0;
      const carriedTasks = weekTasks.filter((task) => Number(task.carryCount || 0) > 0).length;
      $('#week-left').textContent = tasksLeft;
      $('#week-task-percent').textContent = tasksTotal ? `${taskPercent}%` : '—';
      $('#week-task-fill').style.width = `${taskPercent}%`;
      $('#week-task-track').setAttribute('aria-valuenow', taskPercent);
      $('#week-task-track').setAttribute('aria-valuetext', tasksTotal ? `${tasksDone} выполнено, ${tasksLeft} осталось` : 'Задач пока нет');
      $('#week-task-note').textContent = !tasksTotal ? 'Добавьте первую задачу недели' : carriedTasks ? `${carriedTasks} перенесено осознанно` : 'Без повторных переносов';
      $('#week-habits').textContent = habitsDone;
      $('#week-habit-note').textContent = dots.length ? `${habitsDone} из ${dots.length} отметок выполнено` : 'Добавьте первую привычку';
      $('#habit-week-ratio').textContent = `${habitsDone} / ${dots.length} выполнено`;
      $('#week-summary-tasks').textContent = `${tasksDone} / ${tasksTotal}`;
      $('#week-summary-habits').textContent = `${habitsDone} / ${dots.length}`;
      $('#week-state-days').textContent = `${dayStates.length} / 7`;
      $('#week-gap').innerHTML = dayStates.length ? `Состояние учтено: <strong>${dayStates.length} из 7 дней</strong>` : 'Состояние пока не влияет на результат';
      $('[data-od-id="weekly-orbit"]').setAttribute('aria-label', availableWeight ? `Текущий результат недели ${score} процентов. Учтены: ${usedLayers.join(', ')}.` : 'Для результата недели пока нет данных.');

      $$('.day-bar[data-date]').forEach((bar) => {
        const record = storedDayRecords[bar.dataset.date];
        const dayScore = Number(record?.score);
        const hasScore = Number.isFinite(dayScore);
        bar.style.setProperty('--score', hasScore ? dayScore : 0);
        $('.day-bar-score', bar).textContent = hasScore ? dayScore : '—';
        bar.classList.toggle('is-low', hasScore && dayScore < 50);
        bar.classList.toggle('is-warning', hasScore && dayScore >= 50 && dayScore < 70);
        bar.classList.toggle('is-success', hasScore && dayScore >= 70);
      });
    };

    const bindHabitDot = (dot) => dot.addEventListener('click', () => {
      dot.classList.toggle('done');
      habitLog[dot.dataset.date] = habitLog[dot.dataset.date] || {};
      habitLog[dot.dataset.date][dot.dataset.habitId] = dot.classList.contains('done');
      storage.set('orbit-v2-habit-log', habitLog);
      updateWeek();
    });
    habitDots().forEach(bindHabitDot);
    updateWeek();
    addEventListener('storage', (event) => {
      if (!['orbit-v2-task-records', 'orbit-v2-day-records', 'orbit-v2-habit-log'].includes(event.key)) return;
      const liveHabitLog = getHabitLog();
      $$('.habit-dot[data-date][data-habit-id]').forEach((dot) => dot.classList.toggle('done', Boolean(liveHabitLog[dot.dataset.date]?.[dot.dataset.habitId])));
      updateWeek();
    });

    const weeks = [
      { eyebrow: 'Неделя 20 · 2026', title: '11—17 мая' },
      { eyebrow: 'Неделя 21 · 2026', title: '18—24 мая' },
      { eyebrow: 'Неделя 22 · 2026', title: '25—31 мая' }
    ];
    let weekIndex = 1;
    const renderWeek = () => {
      $('.context-header .eyebrow').textContent = weeks[weekIndex].eyebrow;
      $('.context-title').textContent = weeks[weekIndex].title;
    };
    $('[data-period-prev]').addEventListener('click', () => { weekIndex = Math.max(0, weekIndex - 1); renderWeek(); });
    $('[data-period-next]').addEventListener('click', () => { weekIndex = Math.min(weeks.length - 1, weekIndex + 1); renderWeek(); });

    const planDialog = $('#week-plan-dialog');
    const summaryDialog = $('#week-summary-dialog');
    const plannedTasks = storage.get('orbit-v2-planned-tasks', []);
    const savedGoals = storage.get('orbit-v2-week-goals', []);

    const appendGoal = (goal) => {
      const row = document.createElement('div');
      row.className = 'goal-row';
      const name = document.createElement('span');
      name.className = 'goal-name';
      name.textContent = goal.title;
      const track = document.createElement('div');
      track.className = 'track';
      const fill = document.createElement('span');
      fill.style.setProperty('--progress', '0%');
      track.append(fill);
      const value = document.createElement('span');
      value.className = 'goal-value';
      value.textContent = '0%';
      row.title = goal.criterion;
      row.append(name, track, value);
      $('#week-goal-list').append(row);
    };

    savedGoals.forEach(appendGoal);

    const renderPlannerQueue = () => {
      const queue = $('#planner-queue');
      queue.innerHTML = '';
      if (!plannedTasks.length) {
        const note = document.createElement('span');
        note.className = 'field-helper';
        note.textContent = 'Добавленные задачи появятся в соответствующем дне.';
        queue.append(note);
        return;
      }
      plannedTasks.slice(-4).forEach((task) => {
        const item = document.createElement('div');
        item.className = 'planner-queue-item';
        const title = document.createElement('strong');
        title.textContent = task.title;
        const meta = document.createElement('span');
        meta.textContent = `${task.date.split('-').reverse().slice(0, 2).join('.')} · ${task.time || 'без времени'}`;
        item.append(title, meta);
        queue.append(item);
      });
    };
    renderPlannerQueue();

    $$('[data-plan-week]').forEach((button) => button.addEventListener('click', () => {
      planDialog.showModal();
      if (button.hasAttribute('data-focus-goal')) requestAnimationFrame(() => $('#week-goal-title').focus());
    }));
    $$('[data-close-week-plan]').forEach((button) => button.addEventListener('click', () => planDialog.close()));

    $('#week-goal-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const goal = { title: $('#week-goal-title').value.trim(), criterion: $('#week-goal-criterion').value.trim() };
      if (!goal.title || !goal.criterion) return;
      savedGoals.push(goal);
      storage.set('orbit-v2-week-goals', savedGoals);
      appendGoal(goal);
      event.currentTarget.reset();
      showToast('Цель недели добавлена');
    });

    $('#week-task-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const task = { id: `planned-${Date.now()}`, title: $('#week-task-title').value.trim(), date: $('#week-task-date').value, time: $('#week-task-time').value, duration: '', priority: 'Обычный', category: 'Работа', repeat: 'Не повторять', notes: '' };
      if (!task.title || !task.date) return;
      plannedTasks.push(task);
      storage.set('orbit-v2-planned-tasks', plannedTasks);
      const liveTaskRecords = storage.get('orbit-v2-task-records', {});
      liveTaskRecords[task.id] = { ...task, done: false, status: 'active', carryCount: 0 };
      storage.set('orbit-v2-task-records', liveTaskRecords);
      renderPlannerQueue();
      event.currentTarget.reset();
      $('#week-task-date').value = '2026-05-21';
      showToast('Задача добавлена в выбранный день');
    });

    $('[data-finish-week]').addEventListener('click', () => summaryDialog.showModal());
    $('[data-close-week-summary]').addEventListener('click', () => summaryDialog.close());
    $('#week-summary-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const summaries = storage.get('orbit-v2-week-summaries', {});
      summaries['2026-W21'] = { win: $('#week-win-field').value.trim(), change: $('#week-change-field').value.trim(), savedAt: new Date().toISOString() };
      storage.set('orbit-v2-week-summaries', summaries);
      summaryDialog.close();
      showToast('Итог недели сохранён в истории');
    });

    setupHabitEditor({
      onSave: (definition) => {
        let line = $(`.habit-line[data-habit-id="${definition.id}"]`);
        if (!line) line = createWeeklyHabit(definition, true);
        line.dataset.frequency = definition.frequency;
        line.dataset.time = definition.time;
        $('strong', line).textContent = definition.name;
        $('strong', line).title = definition.frequency;
        $('[data-edit-habit]', line).setAttribute('aria-label', `Настроить привычку «${definition.name}»`);
        updateWeek();
      },
      onArchive: ({ id }) => {
        $(`.habit-line[data-habit-id="${id}"]`)?.remove();
        updateWeek();
      }
    });
  }

  if (document.body.dataset.page === 'daily') {
    const taskList = $('#task-list');
    const taskDialog = $('#task-dialog');
    const deleteDialog = $('#delete-dialog');
    const taskForm = $('#task-form');
    const fields = {
      title: $('#task-title-field'),
      date: $('#task-date-field'),
      time: $('#task-time-field'),
      duration: $('#task-duration-field'),
      priority: $('#task-priority-field'),
      category: $('#task-category-field'),
      repeat: $('#task-repeat-field'),
      notes: $('#task-notes-field')
    };
    const todayISO = DEMO_TODAY;
    const requestedDate = new URLSearchParams(location.search).get('date');
    let selectedDate = /^2026-05-\d{2}$/.test(requestedDate || '') ? requestedDate : todayISO;
    let currentTask = null;
    let energy = null;
    let mood = '';
    const taskRecords = storage.get('orbit-v2-task-records', {});
    const habitLog = getHabitLog();
    const dayRecords = getDayRecords();
    const daySummaries = storage.get('orbit-v2-day-summaries', {});
    const plannedTasks = storage.get('orbit-v2-planned-tasks', []);

    const taskItems = () => $$('.task-item', taskList);
    const dayTasks = () => taskItems().filter((task) => task.dataset.date === selectedDate && !['backlog', 'cancelled'].includes(task.dataset.status));
    const habits = () => $$('.habit-toggle');

    const taskMetaMarkup = (task) => {
      const pieces = [];
      if (task.dataset.duration) pieces.push(`<span>${task.dataset.duration} мин</span>`);
      if (task.dataset.priority === 'Высокий') pieces.push('<span class="priority-high">Высокий приоритет</span>');
      if (task.dataset.repeat && task.dataset.repeat !== 'Не повторять') pieces.push(`<span>${task.dataset.repeat}</span>`);
      if (task.dataset.category) pieces.push(`<span>${task.dataset.category}</span>`);
      return pieces.join('') || '<span>Без деталей</span>';
    };

    const taskRecord = (task) => ({
      id: task.dataset.taskId,
      title: task.dataset.title,
      date: task.dataset.date,
      time: task.dataset.time,
      duration: task.dataset.duration,
      priority: task.dataset.priority,
      category: task.dataset.category,
      repeat: task.dataset.repeat,
      notes: task.dataset.notes,
      done: $('input[type="checkbox"]', task).checked,
      status: task.dataset.status || 'active',
      carryCount: Number(task.dataset.carryCount || 0),
      carriedFrom: task.dataset.carriedFrom || ''
    });

    const saveTaskRecords = () => {
      taskItems().forEach((task) => { taskRecords[task.dataset.taskId] = taskRecord(task); });
      storage.set('orbit-v2-task-records', taskRecords);
      storage.set('orbit-v2-task-state', Object.fromEntries(taskItems().map((item) => [item.dataset.taskId, $('input[type="checkbox"]', item).checked])));
    };

    const updateCapacity = (tasks) => {
      const capacity = 360;
      const planned = tasks.reduce((sum, task) => sum + (Number(task.dataset.duration) || 0), 0);
      const timedEnds = tasks.map((task) => {
        if (!task.dataset.time) return null;
        const [hours, minutes] = task.dataset.time.split(':').map(Number);
        return hours * 60 + minutes + (Number(task.dataset.duration) || 0);
      }).filter(Number.isFinite);
      const latest = timedEnds.length ? Math.max(...timedEnds) : null;
      const finish = latest === null ? 'не задано' : `${String(Math.floor(latest / 60) % 24).padStart(2, '0')}:${String(latest % 60).padStart(2, '0')}`;
      const reserve = capacity - planned;
      const ratio = Math.round((planned / capacity) * 100);
      $('#capacity-ratio').textContent = `${formatMinutes(planned)} / ${formatMinutes(capacity)}`;
      $('#capacity-planned').textContent = formatMinutes(planned);
      $('#capacity-reserve').textContent = reserve >= 0 ? formatMinutes(reserve) : `−${formatMinutes(Math.abs(reserve))}`;
      $('#capacity-finish').textContent = finish;
      $('#capacity-fill').style.width = `${Math.min(100, ratio)}%`;
      const track = $('.capacity-track');
      track.setAttribute('aria-valuenow', planned);
      track.setAttribute('aria-valuetext', `${formatMinutes(planned)} из ${formatMinutes(capacity)}`);
      $('.capacity-card').classList.toggle('is-over', reserve < 0);
      $('#capacity-note').textContent = reserve < 0
        ? `План превышает выбранный ритм на ${formatMinutes(Math.abs(reserve))}. Перенесите одну гибкую задачу или сократите объём.`
        : tasks.length ? 'План помещается в выбранный ритм. Резерв остаётся на переключения и незапланированное.' : 'Добавьте задачи с длительностью, чтобы увидеть реальную загрузку дня.';
      if (selectedDate === todayISO) {
        $('#selected-day-note').textContent = tasks.length
          ? `В плане ${formatMinutes(planned)}. ${reserve >= 0 ? `Резерв — ${formatMinutes(reserve)}.` : `Перегрузка — ${formatMinutes(Math.abs(reserve))}.`}`
          : 'План пока пуст. Добавьте только то, что действительно должно случиться сегодня.';
      }
    };

    const updateDaily = () => {
      const tasks = dayTasks();
      const liveDone = tasks.filter((item) => $('input[type="checkbox"]', item).checked).length;
      const finalizedSummary = daySummaries[selectedDate];
      const done = finalizedSummary ? finalizedSummary.taskDone : liveDone;
      const taskTotal = finalizedSummary ? finalizedSummary.taskTotal : tasks.length;
      const habitButtons = habits();
      const habitsDone = habitButtons.filter((habit) => habit.classList.contains('done')).length;
      const stateSaved = Boolean(selectedDate === todayISO && energy && mood && $('#sleep-hours').value);
      const sleep = Number.parseFloat($('#sleep-hours').value) || 0;
      const moodValue = { 'Сложно': 1, 'Ровно': 3, 'Хорошо': 5 }[mood] || 0;
      const taskRatio = taskTotal ? done / taskTotal : 0;
      const habitRatio = habitButtons.length ? habitsDone / habitButtons.length : 0;
      const stateRatio = stateSaved ? (energy / 5) * .45 + (moodValue / 5) * .25 + Math.min(sleep / 8, 1) * .3 : 0;
      const availableWeight = (taskTotal ? 50 : 0) + (habitButtons.length ? 30 : 0) + (stateSaved ? 20 : 0);
      const score = availableWeight ? Math.round(((taskRatio * 50) + (habitRatio * 30) + (stateRatio * 20)) / availableWeight * 100) : 0;
      const usedLayers = [taskTotal ? 'задачам' : '', habitButtons.length ? 'привычкам' : '', stateSaved ? 'состоянию' : ''].filter(Boolean);
      $('#task-count').textContent = `${done} выполнено · ${Math.max(0, taskTotal - done)} осталось`;
      $('#habit-count').textContent = `${habitsDone} / ${habitButtons.length} выполнено`;
      $('#summary-task-count').textContent = `${done} / ${taskTotal}`;
      $('#summary-habit-count').textContent = `${habitsDone} / ${habitButtons.length}`;
      const savedScore = Number(dayRecords[selectedDate]?.score);
      const visibleScore = selectedDate === todayISO ? (availableWeight ? score : null) : Number.isFinite(savedScore) ? savedScore : null;
      $('#day-score').textContent = visibleScore === null ? '—' : `${visibleScore}%`;
      const statusLabel = selectedDate < todayISO ? (daySummaries[selectedDate] ? 'итог сохранён' : 'день завершён') : selectedDate > todayISO ? 'день не начат' : !usedLayers.length ? 'пока нет данных' : score >= 70 ? 'успешно' : score >= 50 ? 'частично' : 'в процессе';
      $('#day-status').textContent = statusLabel;
      $('#day-orbit-label').textContent = usedLayers.length ? `Сегодня · расчёт по ${usedLayers.join(', ')}` : 'Сегодня · добавьте задачи, привычки или состояние';
      const nextTask = tasks.find((task) => !$('input[type="checkbox"]', task).checked);
      $('#day-next').innerHTML = nextTask ? `Следом: <strong>${nextTask.dataset.title.toLowerCase()}</strong>` : 'Следом: <strong>план закрыт</strong>';
      const orbit = $('.day-orbit');
      orbit.classList.toggle('score-success', selectedDate === todayISO && availableWeight > 0 && score >= 70);
      orbit.classList.toggle('score-mid', selectedDate === todayISO && availableWeight > 0 && score >= 50 && score < 70);
      orbit.classList.toggle('score-low', selectedDate === todayISO && availableWeight > 0 && score < 50);
      orbit.setAttribute('aria-label', visibleScore === null ? 'Для результата дня пока нет данных.' : `Текущий прогресс ${visibleScore} процентов, рассчитан по ${usedLayers.join(', ')}.`);
      updateCapacity(tasks);
      if (selectedDate === todayISO || tasks.length) {
        dayRecords[selectedDate] = {
          ...(dayRecords[selectedDate] || {}),
          date: selectedDate,
          taskDone: done,
          taskTotal,
          habitDone: habitsDone,
          habitTotal: habitButtons.length,
          plannedMinutes: tasks.reduce((sum, task) => sum + (Number(task.dataset.duration) || 0), 0),
          score: selectedDate === todayISO ? (availableWeight ? score : dayRecords[selectedDate]?.score) : dayRecords[selectedDate]?.score,
          state: stateSaved ? { energy, mood, sleep: $('#sleep-hours').value } : dayRecords[selectedDate]?.state || null
        };
        storage.set('orbit-v2-day-records', dayRecords);
      }
      saveTaskRecords();
    };

    const openTaskEditor = (task = null) => {
      currentTask = task;
      const isEdit = Boolean(task);
      $('#task-dialog-mode').textContent = isEdit ? 'Редактирование задачи' : 'Новая задача';
      $('#task-dialog-title').textContent = isEdit ? 'Детали задачи' : 'Что нужно сделать?';
      $('#delete-task-button').hidden = !isEdit;
      fields.title.value = isEdit ? task.dataset.title : '';
      fields.date.value = isEdit ? task.dataset.date : selectedDate;
      fields.time.value = isEdit ? task.dataset.time : '';
      fields.duration.value = isEdit ? task.dataset.duration : '';
      fields.priority.value = isEdit ? task.dataset.priority : 'Обычный';
      fields.category.value = isEdit ? task.dataset.category : 'Работа';
      fields.repeat.value = isEdit ? task.dataset.repeat : 'Не повторять';
      fields.notes.value = isEdit ? task.dataset.notes : '';
      taskDialog.showModal();
      requestAnimationFrame(() => fields.title.focus());
    };

    const bindTask = (task) => {
      const checkbox = $('input[type="checkbox"]', task);
      checkbox.addEventListener('change', updateDaily);
      $('[data-open-task]', task).addEventListener('click', () => openTaskEditor(task));
      $('[data-edit-task]', task).addEventListener('click', () => openTaskEditor(task));
    };

    const createTask = (title, detail = {}) => {
      const fragment = $('#task-template').content.cloneNode(true);
      const task = $('.task-item', fragment);
      const id = detail.id || `task-${Date.now()}`;
      task.dataset.taskId = id;
      task.dataset.title = title;
      task.dataset.date = detail.date || selectedDate;
      task.dataset.time = detail.time || '';
      task.dataset.duration = detail.duration || '';
      task.dataset.priority = detail.priority || 'Обычный';
      task.dataset.category = detail.category || 'Личное';
      task.dataset.repeat = detail.repeat || 'Не повторять';
      task.dataset.notes = detail.notes || '';
      task.dataset.status = detail.status || 'active';
      task.dataset.carryCount = detail.carryCount || 0;
      task.dataset.carriedFrom = detail.carriedFrom || '';
      $('input[type="checkbox"]', task).checked = Boolean(detail.done);
      $('.task-title', task).textContent = title;
      $('.task-time', task).textContent = task.dataset.time || '—';
      $('.task-meta', task).innerHTML = taskMetaMarkup(task);
      taskList.append(task);
      const created = taskList.lastElementChild;
      bindTask(created);
      created.dataset.bound = 'true';
      updateDaily();
      return created;
    };

    const knownTaskIds = new Set(taskItems().map((task) => task.dataset.taskId));
    plannedTasks.filter((task) => !knownTaskIds.has(task.id)).forEach((task) => {
      createTask(task.title, taskRecords[task.id] || task);
    });

    const savedState = storage.get('orbit-v2-task-state', {});
    taskItems().forEach((task) => {
      const record = taskRecords[task.dataset.taskId];
      if (record) {
        Object.entries(record).forEach(([key, value]) => {
          if (!['id', 'done'].includes(key) && value !== undefined && value !== null) task.dataset[key] = String(value);
        });
        $('input[type="checkbox"]', task).checked = Boolean(record.done);
        $('.task-title', task).textContent = task.dataset.title;
        $('.task-time', task).textContent = task.dataset.time || '—';
        $('.task-meta', task).innerHTML = taskMetaMarkup(task);
      } else if (Object.hasOwn(savedState, task.dataset.taskId)) {
        $('input[type="checkbox"]', task).checked = Boolean(savedState[task.dataset.taskId]);
      }
      if (!task.dataset.bound) {
        bindTask(task);
        task.dataset.bound = 'true';
      }
    });

    const dailyHabitList = $('.habit-list', $('[data-od-id="today-habits"]'));
    const archived = archivedHabitIds();

    const enhanceDailyHabit = (habit) => {
      const existingRow = habit.closest('.habit-row');
      if (existingRow) return existingRow;
      const row = document.createElement('div');
      row.className = 'habit-row';
      row.dataset.habitId = habit.dataset.habitId;
      row.dataset.frequency = habit.dataset.frequency || 'Каждый день';
      row.dataset.time = habit.dataset.time || '';
      habit.before(row);
      row.append(habit, createHabitEditButton($('strong', habit)?.textContent.trim() || 'Привычка'));
      return row;
    };

    const createDailyHabit = (definition, bindNow = false) => {
      const habit = document.createElement('button');
      habit.type = 'button';
      habit.className = 'habit-toggle';
      habit.dataset.habitId = definition.id;
      habit.dataset.frequency = definition.frequency || 'Каждый день';
      habit.dataset.time = definition.time || '';
      const title = document.createElement('strong');
      title.textContent = definition.name;
      title.title = habit.dataset.frequency;
      const mark = document.createElement('span');
      mark.setAttribute('aria-hidden', 'true');
      habit.append(title, mark);
      dailyHabitList.append(habit);
      enhanceDailyHabit(habit);
      if (bindNow) bindHabit(habit);
      return habit;
    };

    $$('.habit-toggle[data-habit-id]').forEach((habit) => {
      if (archived.has(habit.dataset.habitId)) habit.closest('.habit-row')?.remove() || habit.remove();
      else {
        habit.dataset.frequency ||= 'Каждый день';
        habit.dataset.time ||= '';
        enhanceDailyHabit(habit);
      }
    });
    habitDefinitions().forEach((definition) => {
      if (archived.has(definition.id)) return;
      const existing = $(`.habit-toggle[data-habit-id="${definition.id}"]`);
      if (!existing) createDailyHabit(definition);
      else {
        existing.dataset.frequency = definition.frequency || 'Каждый день';
        existing.dataset.time = definition.time || '';
        $('strong', existing).textContent = definition.name;
        $('strong', existing).title = existing.dataset.frequency;
        const row = enhanceDailyHabit(existing);
        row.dataset.frequency = existing.dataset.frequency;
        row.dataset.time = existing.dataset.time;
        $('[data-edit-habit]', row).setAttribute('aria-label', `Настроить привычку «${definition.name}»`);
      }
    });

    const renderHabitState = () => habits().forEach((habit) => habit.classList.toggle('done', Boolean(habitLog[selectedDate]?.[habit.dataset.habitId])));
    const bindHabit = (habit) => habit.addEventListener('click', () => {
      habit.classList.toggle('done');
      habitLog[selectedDate] = habitLog[selectedDate] || {};
      habitLog[selectedDate][habit.dataset.habitId] = habit.classList.contains('done');
      storage.set('orbit-v2-habit-log', habitLog);
      updateDaily();
    });
    habits().forEach(bindHabit);

    $$('[data-open-task]').filter((button) => !button.closest('.task-item')).forEach((button) => button.addEventListener('click', () => openTaskEditor()));
    $$('[data-close-task]').forEach((button) => button.addEventListener('click', () => taskDialog.close()));

    taskForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!fields.title.value.trim()) return;
      const isNew = !currentTask;
      if (isNew) currentTask = createTask(fields.title.value.trim());
      currentTask.dataset.title = fields.title.value.trim();
      currentTask.dataset.date = fields.date.value;
      currentTask.dataset.time = fields.time.value;
      currentTask.dataset.duration = fields.duration.value;
      currentTask.dataset.priority = fields.priority.value;
      currentTask.dataset.category = fields.category.value;
      currentTask.dataset.repeat = fields.repeat.value;
      currentTask.dataset.notes = fields.notes.value.trim();
      currentTask.dataset.kind = fields.priority.value === 'Высокий' ? 'focus' : 'quick';
      $('.task-title', currentTask).textContent = currentTask.dataset.title;
      $('.task-time', currentTask).textContent = currentTask.dataset.time || '—';
      $('.task-meta', currentTask).innerHTML = taskMetaMarkup(currentTask);
      if (isNew) {
        plannedTasks.push({ id: currentTask.dataset.taskId, title: currentTask.dataset.title, date: currentTask.dataset.date, time: currentTask.dataset.time, duration: currentTask.dataset.duration, priority: currentTask.dataset.priority, category: currentTask.dataset.category, repeat: currentTask.dataset.repeat, notes: currentTask.dataset.notes });
      }
      const plannedIndex = plannedTasks.findIndex((task) => task.id === currentTask.dataset.taskId);
      if (plannedIndex >= 0) plannedTasks[plannedIndex] = { id: currentTask.dataset.taskId, title: currentTask.dataset.title, date: currentTask.dataset.date, time: currentTask.dataset.time, duration: currentTask.dataset.duration, priority: currentTask.dataset.priority, category: currentTask.dataset.category, repeat: currentTask.dataset.repeat, notes: currentTask.dataset.notes };
      storage.set('orbit-v2-planned-tasks', plannedTasks);
      taskDialog.close();
      renderSelectedDate();
      updateDaily();
      showToast(currentTask.dataset.date === selectedDate ? 'Задача сохранена' : 'Задача сохранена на другую дату');
    });

    $('#delete-task-button').addEventListener('click', () => deleteDialog.showModal());
    $('[data-cancel-delete]').addEventListener('click', () => deleteDialog.close());
    $('[data-confirm-delete]').addEventListener('click', () => {
      if (currentTask) {
        const plannedIndex = plannedTasks.findIndex((task) => task.id === currentTask.dataset.taskId);
        if (plannedIndex >= 0) plannedTasks.splice(plannedIndex, 1);
        storage.set('orbit-v2-planned-tasks', plannedTasks);
        delete taskRecords[currentTask.dataset.taskId];
        storage.set('orbit-v2-task-records', taskRecords);
        currentTask.remove();
      }
      deleteDialog.close();
      taskDialog.close();
      renderSelectedDate();
      updateDaily();
      showToast('Задача удалена');
    });

    const workoutsByDate = storage.get('orbit-v2-scheduled-workouts', {});
    const stateByDate = storage.get('orbit-v2-day-state', {});

    const renderState = () => {
      const state = stateByDate[selectedDate] || {};
      energy = state.energy || null;
      mood = state.mood || '';
      $('#sleep-hours').value = state.sleep || '';
      $$('[data-energy]').forEach((button) => button.classList.toggle('active', Number(button.dataset.energy) === Number(energy)));
      $$('[data-mood]').forEach((button) => button.classList.toggle('active', button.dataset.mood === mood));
      $('#state-status').textContent = daySummaries[selectedDate] ? 'итог сохранён' : energy && mood && state.sleep ? `${energy} / 5 · ${mood.toLowerCase()}` : 'не заполнено';
    };

    const dateFromISO = (iso) => new Date(`${iso}T12:00:00`);
    const isoFromDate = (date) => date.toISOString().slice(0, 10);
    const shiftDate = (iso, amount) => {
      const date = dateFromISO(iso);
      date.setDate(date.getDate() + amount);
      return isoFromDate(date);
    };

    const renderWorkout = () => {
      const workout = workoutsByDate[selectedDate];
      const title = $('#workout-status-title');
      const note = $('#workout-status-note');
      const button = $('[data-schedule-workout]');
      const oldLink = $('[data-open-scheduled-workout]');
      if (oldLink) oldLink.remove();
      if (!workout) {
        title.textContent = 'Тренировка не запланирована';
        note.textContent = 'Она не влияет на план дня, пока вы сами не добавите её в расписание.';
        button.textContent = 'Запланировать';
        return;
      }
      title.textContent = workout.name;
      note.textContent = `${workout.time || 'Без времени'} · тренировка добавлена только в этот день`;
      button.textContent = 'Изменить';
      const link = document.createElement('a');
      link.className = 'primary-action';
      link.href = 'workout-session.html';
      link.dataset.openScheduledWorkout = '';
      link.textContent = 'Открыть тренировку';
      button.before(link);
    };

    const renderSelectedDate = () => {
      const date = dateFromISO(selectedDate);
      const tomorrowISO = shiftDate(todayISO, 1);
      const finalized = Boolean(daySummaries[selectedDate]);
      $('#selected-day-label').textContent = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
      $('#selected-day-title').textContent = selectedDate === todayISO ? 'Сегодня' : selectedDate === tomorrowISO ? 'Завтра' : new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
      $('[data-day-today]').textContent = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date).replace('.', '');
      $('#selected-day-note').textContent = selectedDate === todayISO ? 'Свободное окно до 11:30. Сначала ключевая задача, затем короткие дела.' : 'План на будущий день. Добавляйте задачи и события — выполнение станет доступно в сам день.';
      $('#day-orbit-label').textContent = selectedDate === todayISO ? 'Сегодня · задачи 50% / привычки 30% / состояние 20%' : 'Будущий день · итог появится после начала дня';
      taskItems().forEach((task) => {
        task.hidden = task.dataset.date !== selectedDate || ['backlog', 'cancelled'].includes(task.dataset.status);
        $('input[type="checkbox"]', task).disabled = selectedDate !== todayISO || finalized;
      });
      $('#task-empty').hidden = dayTasks().length > 0;
      renderHabitState();
      renderState();
      habits().forEach((habit) => { habit.disabled = selectedDate !== todayISO || finalized; });
      $$('.state-scale button').forEach((button) => { button.disabled = selectedDate !== todayISO || finalized; });
      $('#sleep-hours').disabled = selectedDate !== todayISO || finalized;
      $('[data-finish-day]').disabled = selectedDate !== todayISO || finalized;
      $('[data-finish-day]').textContent = finalized ? 'Итог сохранён' : 'Подвести итог дня';
      document.body.classList.toggle('future-day', selectedDate !== todayISO);
      renderWorkout();
      updateDaily();
    };

    $('[data-day-prev]').addEventListener('click', () => { selectedDate = shiftDate(selectedDate, -1); renderSelectedDate(); });
    $('[data-day-next]').addEventListener('click', () => { selectedDate = shiftDate(selectedDate, 1); renderSelectedDate(); });
    $('[data-day-today]').addEventListener('click', () => { selectedDate = todayISO; renderSelectedDate(); });

    const updateStateStatus = () => {
      const complete = energy && mood && $('#sleep-hours').value;
      $('#state-status').textContent = complete ? `${energy} / 5 · ${mood.toLowerCase()}` : 'не заполнено';
      if (complete) {
        stateByDate[todayISO] = { energy, mood, sleep: $('#sleep-hours').value };
        storage.set('orbit-v2-day-state', stateByDate);
      }
      updateDaily();
    };
    $$('[data-energy]').forEach((button) => button.addEventListener('click', () => {
      energy = Number(button.dataset.energy);
      $$('[data-energy]').forEach((item) => item.classList.toggle('active', item === button));
      updateStateStatus();
    }));
    $$('[data-mood]').forEach((button) => button.addEventListener('click', () => {
      mood = button.dataset.mood;
      $$('[data-mood]').forEach((item) => item.classList.toggle('active', item === button));
      updateStateStatus();
    }));
    $('#sleep-hours').addEventListener('change', updateStateStatus);
    updateStateStatus();

    setupHabitEditor({
      onSave: (definition) => {
        let habit = $(`.habit-toggle[data-habit-id="${definition.id}"]`);
        if (!habit) {
          habit = createDailyHabit(definition, true);
          habitLog[selectedDate] = habitLog[selectedDate] || {};
          habitLog[selectedDate][definition.id] = false;
          storage.set('orbit-v2-habit-log', habitLog);
        }
        habit.dataset.frequency = definition.frequency;
        habit.dataset.time = definition.time;
        $('strong', habit).textContent = definition.name;
        $('strong', habit).title = definition.frequency;
        const row = enhanceDailyHabit(habit);
        row.dataset.frequency = definition.frequency;
        row.dataset.time = definition.time;
        $('[data-edit-habit]', row).setAttribute('aria-label', `Настроить привычку «${definition.name}»`);
        renderSelectedDate();
      },
      onArchive: ({ id }) => {
        const habit = $(`.habit-toggle[data-habit-id="${id}"]`);
        const row = habit?.closest('.habit-row');
        if (row) row.remove();
        else habit?.remove();
        updateDaily();
      }
    });

    const workoutDialog = $('#workout-schedule-dialog');
    $('[data-schedule-workout]').addEventListener('click', () => {
      const existing = workoutsByDate[selectedDate];
      $('#scheduled-workout-name').value = existing?.name || 'Силовая A';
      $('#scheduled-workout-time').value = existing?.time || '18:45';
      workoutDialog.showModal();
    });
    $('[data-close-workout-schedule]').addEventListener('click', () => workoutDialog.close());
    $('#workout-schedule-form').addEventListener('submit', (event) => {
      event.preventDefault();
      workoutsByDate[selectedDate] = { name: $('#scheduled-workout-name').value, time: $('#scheduled-workout-time').value };
      storage.set('orbit-v2-scheduled-workouts', workoutsByDate);
      workoutDialog.close();
      renderWorkout();
      showToast('Тренировка добавлена в выбранный день');
    });

    const daySummaryDialog = $('#day-summary-dialog');
    const renderCarryoverChoices = () => {
      const list = $('#carryover-list');
      list.innerHTML = '';
      const openTasks = dayTasks().filter((task) => !$('input[type="checkbox"]', task).checked);
      if (!openTasks.length) {
        const empty = document.createElement('p');
        empty.className = 'carryover-empty';
        empty.textContent = 'Незавершённых задач нет — план закрыт без переносов.';
        list.append(empty);
        return;
      }
      openTasks.forEach((task) => {
        const row = document.createElement('div');
        row.className = 'carryover-row';
        row.dataset.taskId = task.dataset.taskId;
        const copy = document.createElement('div');
        const title = document.createElement('strong');
        title.textContent = task.dataset.title;
        const meta = document.createElement('small');
        meta.textContent = `${task.dataset.time || 'без времени'} · ${task.dataset.duration ? `${task.dataset.duration} мин` : 'без длительности'}`;
        copy.append(title, meta);
        const select = document.createElement('select');
        select.dataset.carryoverAction = '';
        select.setAttribute('aria-label', `Что сделать с задачей «${task.dataset.title}»`);
        [['tomorrow', 'Перенести на завтра'], ['keep', 'Оставить в этом дне'], ['backlog', 'Отложить без даты'], ['cancel', 'Больше не актуально']].forEach(([value, label]) => {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = label;
          select.append(option);
        });
        row.append(copy, select);
        list.append(row);
      });
    };
    $('[data-finish-day]').addEventListener('click', () => { renderCarryoverChoices(); daySummaryDialog.showModal(); });
    $('[data-close-day-summary]').addEventListener('click', () => daySummaryDialog.close());
    $('#day-summary-form').addEventListener('submit', (event) => {
      event.preventDefault();
      const sourceTasks = dayTasks();
      const taskSnapshots = sourceTasks.map((task) => ({ ...taskRecord(task), originalDate: selectedDate, action: 'done' }));
      $$('.carryover-row', $('#carryover-list')).forEach((row) => {
        const task = taskItems().find((item) => item.dataset.taskId === row.dataset.taskId);
        if (!task) return;
        const action = $('[data-carryover-action]', row).value;
        const snapshot = taskSnapshots.find((item) => item.id === task.dataset.taskId);
        if (snapshot) snapshot.action = action;
        if (action === 'tomorrow') {
          task.dataset.carriedFrom = selectedDate;
          task.dataset.carryCount = String(Number(task.dataset.carryCount || 0) + 1);
          task.dataset.date = shiftDate(selectedDate, 1);
        } else if (action === 'backlog') {
          task.dataset.status = 'backlog';
        } else if (action === 'cancel') {
          task.dataset.status = 'cancelled';
        }
        const plannedIndex = plannedTasks.findIndex((item) => item.id === task.dataset.taskId);
        if (plannedIndex >= 0) plannedTasks[plannedIndex] = { ...plannedTasks[plannedIndex], ...taskRecord(task) };
      });
      storage.set('orbit-v2-planned-tasks', plannedTasks);
      saveTaskRecords();
      const habitsDone = habits().filter((habit) => habit.classList.contains('done')).length;
      daySummaries[selectedDate] = {
        date: selectedDate,
        note: $('#day-note-field').value.trim(),
        savedAt: new Date().toISOString(),
        taskDone: taskSnapshots.filter((task) => task.done).length,
        taskTotal: taskSnapshots.length,
        habitDone: habitsDone,
        habitTotal: habits().length,
        tasks: taskSnapshots
      };
      storage.set('orbit-v2-day-summaries', daySummaries);
      dayRecords[selectedDate] = { ...(dayRecords[selectedDate] || {}), finalized: true, finalizedAt: daySummaries[selectedDate].savedAt };
      storage.set('orbit-v2-day-records', dayRecords);
      daySummaryDialog.close();
      $('#state-status').textContent = 'итог сохранён';
      renderSelectedDate();
      showToast('Итог сохранён, решения по задачам применены');
    });

    renderSelectedDate();
    addEventListener('storage', (event) => {
      if (event.key === 'orbit-v2-habit-log') {
        const liveHabitLog = getHabitLog();
        Object.keys(habitLog).forEach((key) => delete habitLog[key]);
        Object.assign(habitLog, liveHabitLog);
        renderHabitState();
        updateDaily();
      }
      if (['orbit-v2-planned-tasks', 'orbit-v2-task-records'].includes(event.key)) location.reload();
    });
  }

  if (document.body.dataset.page === 'workout') {
    const picker = $('#workout-picker');
    const finishDialog = $('#finish-workout-dialog');
    const exerciseDialog = $('#exercise-dialog');
    const sessionStart = Date.now() - 18 * 60 * 1000 - 42 * 1000;

    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
      const hours = String(Math.floor(elapsed / 3600)).padStart(2, '0');
      const minutes = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
      const seconds = String(elapsed % 60).padStart(2, '0');
      $('#session-timer').textContent = `${hours}:${minutes}:${seconds}`;
    };

    const updateSession = () => {
      const sets = $$('[data-set-row]');
      const done = sets.filter((row) => $('.set-check', row).classList.contains('done')).length;
      const percent = sets.length ? Math.round(done / sets.length * 100) : 0;
      $('#session-progress-label').textContent = `${done} / ${sets.length}`;
      $('#session-progress-bar').style.setProperty('--progress', `${percent}%`);
      $('#finish-set-count').textContent = `${done} / ${sets.length}`;
      storage.set('orbit-v2-workout-progress', { done, total: sets.length });
    };

    const bindExercise = (exercise) => {
      $$('.set-check', exercise).forEach((button) => button.addEventListener('click', () => {
        button.classList.toggle('done');
        button.textContent = button.classList.contains('done') ? '✓' : '';
        updateSession();
      }));
      $('[data-add-set]', exercise).addEventListener('click', () => {
        const sets = $('.sets', exercise);
        const source = $('[data-set-row]:last-child', sets);
        const row = source.cloneNode(true);
        $('.set-index', row).textContent = String($$('[data-set-row]', sets).length + 1);
        const check = $('.set-check', row);
        check.classList.remove('done');
        check.textContent = '';
        check.setAttribute('aria-label', 'Отметить новый подход выполненным');
        sets.append(row);
        check.addEventListener('click', () => { check.classList.toggle('done'); check.textContent = check.classList.contains('done') ? '✓' : ''; updateSession(); });
        updateSession();
      });
      $('[data-toggle-options]', exercise).addEventListener('click', () => $('.exercise-options', exercise).classList.toggle('show'));
    };

    $$('.exercise-card').forEach(bindExercise);
    $$('[data-open-workout-picker]').forEach((button) => button.addEventListener('click', () => picker.showModal()));
    $('[data-close-workout-picker]').addEventListener('click', () => picker.close());
    $('[data-choose-workout]').addEventListener('click', () => {
      $('#session-title').textContent = $('#workout-plan-select').value;
      picker.close();
      showToast('План тренировки загружен');
    });

    $('[data-copy-previous]').addEventListener('click', () => {
      $$('[data-set-row]').forEach((row) => {
        const previous = $('.previous-set', row).textContent.split('×').map((part) => part.trim());
        const inputs = $$('input', row);
        if (previous.length === 2) {
          inputs[0].value = previous[0].replace(',', '.');
          inputs[1].value = previous[1];
        }
      });
      showToast('Показатели прошлой тренировки подставлены');
    });

    $$('[data-finish-workout]').forEach((button) => button.addEventListener('click', () => finishDialog.showModal()));
    $('[data-close-finish]').addEventListener('click', () => finishDialog.close());
    $('[data-save-workout]').addEventListener('click', () => {
      storage.set('orbit-v2-last-workout', { name: $('#session-title').textContent, savedAt: new Date().toISOString() });
      finishDialog.close();
      showToast('Тренировка сохранена в истории');
    });

    $('[data-add-exercise]').addEventListener('click', () => exerciseDialog.showModal());
    $('[data-close-exercise]').addEventListener('click', () => exerciseDialog.close());
    $('[data-confirm-exercise]').addEventListener('click', (event) => {
      event.preventDefault();
      const field = $('#exercise-name-field');
      if (!field.value.trim()) return;
      const source = $$('.exercise-card').at(-1);
      const clone = source.cloneNode(true);
      clone.removeAttribute('data-od-id');
      clone.dataset.exercise = field.value.trim();
      $('h2', clone).textContent = field.value.trim();
      $('.exercise-head p', clone).textContent = 'Новое упражнение · предыдущих данных нет';
      const rows = $$('[data-set-row]', clone);
      rows.slice(1).forEach((row) => row.remove());
      $('.set-index', clone).textContent = '1';
      $('.previous-set', clone).textContent = '—';
      $$('input', clone).forEach((input) => { input.value = ''; });
      const check = $('.set-check', clone);
      check.classList.remove('done');
      check.textContent = '';
      $('[data-add-exercise]').before(clone);
      bindExercise(clone);
      field.value = '';
      exerciseDialog.close();
      updateSession();
      showToast('Упражнение добавлено');
    });

    updateTimer();
    setInterval(updateTimer, 1000);
    updateSession();
    if (new URLSearchParams(location.search).get('base') === 'history') showToast('Показатели выбранной тренировки подставлены как основа');
  }

  if (document.body.dataset.page === 'history') {
    const workoutDialog = $('#workout-history-dialog');
    const dayData = {
      18: { date: 'Понедельник, 18 мая', result: 'План выполнен частично · одна задача перенесена', tasks: '3 / 6', habits: '2 / 4', items: [['done', 'Подготовить структуру исследования', '09:00 · завершено'], ['', 'Согласовать бюджет', 'Перенесено на 19 мая'], ['done', 'Прогулка 30 минут', '18:10 · завершено']] },
      19: { date: 'Вторник, 19 мая', result: 'План выполнен · без переносов', tasks: '5 / 5', habits: '3 / 4', items: [['done', 'Интервью с пользователем', '10:00 · завершено'], ['done', 'Собрать выводы', '13:30 · завершено'], ['done', 'Без экрана после 22:00', 'привычка выполнена']] },
      20: { date: 'Среда, 20 мая', result: 'План выполнен частично · незавершённые задачи перенесены', tasks: '3 / 5', habits: '2 / 4', items: [['done', 'Каркас стратегии на квартал', '08:30 · завершено'], ['done', 'Ответить команде по блокерам', '12:20 · завершено'], ['', 'Проверить сценарий первого запуска', 'Перенесено на 21 мая'], ['done', 'Силовая A', '18:45 · 7 подходов']] }
    };

    const renderReviewItems = (items) => {
      const list = $('#review-list');
      list.innerHTML = '';
      if (!items.length) {
        const empty = document.createElement('div');
        empty.className = 'review-item';
        const mark = document.createElement('i');
        const copy = document.createElement('span');
        copy.textContent = 'Нет событий для показа';
        const meta = document.createElement('small');
        meta.textContent = 'Можно вернуться к плану дня';
        copy.append(meta);
        empty.append(mark, copy);
        list.append(empty);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement('div');
        row.className = `review-item ${item.state || ''}`.trim();
        const mark = document.createElement('i');
        const copy = document.createElement('span');
        copy.textContent = item.title;
        const meta = document.createElement('small');
        meta.textContent = item.meta;
        copy.append(meta);
        row.append(mark, copy);
        list.append(row);
      });
    };

    const renderDay = (day) => {
      const iso = `2026-05-${String(day).padStart(2, '0')}`;
      const summaries = storage.get('orbit-v2-day-summaries', {});
      const records = getDayRecords();
      const summary = summaries[iso];
      const record = records[iso];
      const actionLabels = {
        tomorrow: `Перенесено на ${day + 1} мая`,
        keep: 'Оставлено в исходном дне',
        backlog: 'Отложено без даты',
        cancel: 'Больше не актуально',
        done: 'Завершено'
      };
      if (summary) {
        const formattedDate = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${iso}T12:00:00`));
        const transferred = summary.tasks.filter((task) => task.action === 'tomorrow').length;
        $('#review-date').textContent = formattedDate;
        $('#review-result').textContent = transferred ? `Итог сохранён · перенесено: ${transferred}` : 'Итог сохранён без автоматических переносов';
        $('#review-tasks').textContent = `${summary.taskDone} / ${summary.taskTotal}`;
        $('#review-habits').textContent = `${summary.habitDone} / ${summary.habitTotal}`;
        renderReviewItems(summary.tasks.map((task) => ({ state: task.done ? 'done' : '', title: task.title, meta: task.done ? `${task.time || 'без времени'} · завершено` : actionLabels[task.action] || 'Оставлено в дне' })));
      } else if (record && iso === DEMO_TODAY) {
        $('#review-date').textContent = 'Среда, 20 мая';
        $('#review-result').textContent = 'День в процессе · изменения уже учитываются в неделе';
        $('#review-tasks').textContent = `${record.taskDone} / ${record.taskTotal}`;
        $('#review-habits').textContent = `${record.habitDone} / ${record.habitTotal}`;
        const recordsForDay = Object.values(storage.get('orbit-v2-task-records', {})).filter((task) => task.date === iso && !['backlog', 'cancelled'].includes(task.status));
        renderReviewItems(recordsForDay.map((task) => ({ state: task.done ? 'done' : '', title: task.title, meta: task.done ? `${task.time || 'без времени'} · завершено` : `${task.time || 'без времени'} · в плане` })));
      } else {
        const data = dayData[day] || { date: `${day} мая`, result: day > 20 ? 'План ещё не заполнен' : 'День сохранён без подробных записей', tasks: day > 20 ? '—' : '4 / 6', habits: day > 20 ? '—' : '2 / 3', items: [] };
        $('#review-date').textContent = data.date;
        $('#review-result').textContent = data.result;
        $('#review-tasks').textContent = data.tasks;
        $('#review-habits').textContent = data.habits;
        renderReviewItems(data.items.map(([state, title, meta]) => ({ state, title, meta })));
      }
      $('#review-open-plan').href = `daily-detail-v2.html?date=${iso}`;
    };

    $$('.calendar-day').forEach((button) => button.addEventListener('click', () => {
      $$('.calendar-day').forEach((day) => day.classList.toggle('selected', day === button));
      renderDay(Number(button.dataset.day));
    }));

    const query = new URLSearchParams(location.search);
    if (query.has('day')) {
      const target = $(`.calendar-day[data-day="${query.get('day')}"]:not(.is-outside)`);
      if (target) target.click();
    } else renderDay(20);
    addEventListener('storage', (event) => {
      if (!['orbit-v2-task-records', 'orbit-v2-day-records', 'orbit-v2-day-summaries'].includes(event.key)) return;
      const selected = $('.calendar-day.selected:not(.is-outside)');
      renderDay(Number(selected?.dataset.day || 20));
    });

    let historyScale = 'month';
    let historyOffset = 0;
    const periodLabels = {
      day: ['19 мая 2026', '20 мая 2026', '21 мая 2026'],
      week: ['11—17 мая', '18—24 мая', '25—31 мая'],
      month: ['Апрель 2026', 'Май 2026', 'Июнь 2026']
    };
    const renderPeriod = () => { $('#history-period-title').textContent = periodLabels[historyScale][historyOffset + 1]; };

    $$('[data-history-scale]').forEach((button) => button.addEventListener('click', () => {
      $$('[data-history-scale]').forEach((item) => item.classList.toggle('active', item === button));
      historyScale = button.dataset.historyScale;
      historyOffset = 0;
      renderPeriod();
    }));

    $$('[data-history-tab]').forEach((button) => button.addEventListener('click', () => {
      $$('[data-history-tab]').forEach((item) => item.classList.toggle('active', item === button));
      $$('[data-history-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.historyPanel === button.dataset.historyTab));
    }));

    $$('[data-history-day]').forEach((button) => button.addEventListener('click', () => {
      const target = $(`.calendar-day[data-day="${button.dataset.historyDay}"]:not(.is-outside)`);
      if (target) target.click();
      showToast(`Открыт ${button.dataset.historyDay} мая`);
    }));

    const exerciseData = {
      bench: [['58%', '77,5'], ['64%', '80'], ['64%', '80'], ['72%', '82,5'], ['80%', '85'], ['80%', '85'], ['86%', '87,5'], ['86%', '87,5']],
      row: [['50%', '60'], ['56%', '62,5'], ['56%', '62,5'], ['62%', '65'], ['62%', '65'], ['69%', '67,5'], ['69%', '67,5'], ['74%', '70']],
      squat: [['54%', '90'], ['58%', '92,5'], ['62%', '95'], ['62%', '95'], ['68%', '97,5'], ['72%', '100'], ['72%', '100'], ['78%', '102,5']]
    };
    $('#exercise-history-select').addEventListener('change', (event) => {
      const bars = $$('.trend-bar', $('#exercise-trend'));
      exerciseData[event.target.value].forEach(([height, label], index) => { bars[index].style.setProperty('--bar', height); $('span', bars[index]).textContent = label; });
    });
    if (query.get('exercise') === 'bench') {
      $('[data-history-tab="workouts"]').click();
      $('#exercise-history-select').value = 'bench';
    }

    $$('[data-open-workout-history]').forEach((button) => button.addEventListener('click', () => {
      $('#workout-history-date').textContent = button.dataset.workoutDate;
      workoutDialog.showModal();
    }));
    $$('[data-close-workout-history]').forEach((button) => button.addEventListener('click', () => workoutDialog.close()));
    $('[data-copy-history-workout]').addEventListener('click', () => {
      storage.set('orbit-v2-workout-template', { name: 'Силовая A', source: $('#workout-history-date').textContent });
      workoutDialog.close();
      location.href = 'workout-session.html?base=history';
    });
    $('[data-history-prev]').addEventListener('click', () => { historyOffset = Math.max(-1, historyOffset - 1); renderPeriod(); });
    $('[data-history-next]').addEventListener('click', () => { historyOffset = Math.min(1, historyOffset + 1); renderPeriod(); });
  }
})();
