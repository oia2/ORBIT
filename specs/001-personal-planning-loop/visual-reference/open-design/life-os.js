(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  class OrbitField {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.pointer = { x: .5, y: .5 };
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
      canvas.parentElement.addEventListener('pointerleave', () => {
        this.pointer = { x: .5, y: .5 };
      });
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
      if (reducedMotion) this.draw(0);
    }

    draw(now = 0) {
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
        const count = compact ? 34 + ring * 9 : 50 + ring * 13;
        const rx = Math.min(w * (.18 + ring * .09), w * .46);
        const ry = Math.min(h * (.1 + ring * .055), h * .31);
        const tilt = -.28 + ring * .12;
        for (let i = 0; i < count; i += 1) {
          const phase = (i / count) * Math.PI * 2 + time * (ring % 2 ? -.72 : .5) + ring;
          const wave = Math.sin(phase * 3 + time * 4) * (4 + ring * 1.5);
          const x0 = Math.cos(phase) * (rx + wave);
          const y0 = Math.sin(phase) * (ry + wave * .25);
          const x = cx + x0 * Math.cos(tilt) - y0 * Math.sin(tilt);
          const y = cy + x0 * Math.sin(tilt) + y0 * Math.cos(tilt);
          const front = (Math.sin(phase) + 1) / 2;
          ctx.globalAlpha = .08 + front * .28;
          ctx.fillStyle = ring === 1 && i % 7 === 0 ? accent : muted;
          ctx.fillText(symbols[(i + ring * 2) % symbols.length], x, y);
        }
      }

      ctx.globalAlpha = .16;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.min(w * .29, 190), Math.min(h * .17, 90), -.2 + Math.sin(time) * .04, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (!reducedMotion) this.frame = requestAnimationFrame(this.draw);
    }
  }

  document.querySelectorAll('.orbit-canvas').forEach((canvas) => new OrbitField(canvas));

  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* local mode */ }
    }
  };

  if (document.body.dataset.page === 'weekly') {
    const dots = [...document.querySelectorAll('.habit-dot')];
    const saved = storage.get('orbit-weekly-habits', null);
    if (Array.isArray(saved)) dots.forEach((dot, index) => dot.classList.toggle('done', Boolean(saved[index])));

    const updateCurrentDay = () => {
      const currentDay = document.querySelector('[data-current-day]');
      const taskState = storage.get('orbit-daily-tasks', null);
      const ritualState = storage.get('orbit-daily-rituals', null);
      const taskDone = taskState ? Object.values(taskState).filter(Boolean).length : 3;
      const habitDone = ritualState ? ritualState.filter(Boolean).length : 2;
      const score = Math.round((taskDone / 6) * 50) + Math.round((habitDone / 4) * 30) + 16;
      const statusClass = score >= 70 ? 'is-success' : score >= 50 ? 'is-warning' : 'is-low';
      const statusLabel = score >= 70 ? 'успешный день' : score >= 50 ? 'план выполнен частично' : 'план не выполнен';

      currentDay.classList.remove('is-success', 'is-warning', 'is-low');
      currentDay.classList.add(statusClass);
      currentDay.style.setProperty('--score', score);
      currentDay.querySelector('.day-bar-score').textContent = score;
      currentDay.setAttribute('aria-label', `Среда, ${score} из 100, ${statusLabel}`);

      const successful = [...document.querySelectorAll('.day-bar')].filter((bar) => Number.parseInt(bar.style.getPropertyValue('--score'), 10) >= 70).length;
      document.querySelector('#successful-days').textContent = `${successful} ${successful === 1 ? 'успешный' : 'успешных'}`;
    };

    const updateWeek = () => {
      const completedHabits = dots.filter((dot) => dot.classList.contains('done')).length;
      const done = 18;
      const left = 7;
      const taskScore = (done / (done + left)) * 100;
      const habitScore = (completedHabits / dots.length) * 100;
      const stateScore = 80;
      const progress = Math.round(taskScore * .5 + habitScore * .3 + stateScore * .2);
      document.querySelector('#done-count').textContent = done;
      document.querySelector('#left-count').textContent = left;
      document.querySelector('#week-progress').textContent = `${progress}%`;
      document.querySelector('#weekly-habit-count').textContent = `${completedHabits} / ${dots.length}`;
      storage.set('orbit-weekly-habits', dots.map((dot) => dot.classList.contains('done')));
    };

    dots.forEach((dot) => dot.addEventListener('click', () => {
      dot.classList.toggle('done');
      updateWeek();
    }));
    window.addEventListener('storage', (event) => {
      if (event.key === 'orbit-daily-tasks' || event.key === 'orbit-daily-rituals') updateCurrentDay();
    });
    updateCurrentDay();
    updateWeek();
  }

  if (document.body.dataset.page === 'daily') {
    const tasks = [...document.querySelectorAll('.task-item')];
    const inputs = tasks.map((task) => task.querySelector('input[type="checkbox"]'));
    const taskState = storage.get('orbit-daily-tasks', {});
    tasks.forEach((task, index) => {
      const id = task.dataset.taskId;
      if (Object.hasOwn(taskState, id)) inputs[index].checked = Boolean(taskState[id]);
    });

    const rituals = [...document.querySelectorAll('.ritual-button')];
    const savedRituals = storage.get('orbit-daily-rituals', null);
    if (Array.isArray(savedRituals)) rituals.forEach((ritual, index) => ritual.classList.toggle('done', Boolean(savedRituals[index])));

    const updateDailyScore = () => {
      const taskDone = inputs.filter((input) => input.checked).length;
      const habitDone = rituals.filter((ritual) => ritual.classList.contains('done')).length;
      const taskRatio = taskDone / inputs.length;
      const habitRatio = habitDone / rituals.length;
      const stateScore = 80;
      const taskPart = Math.round(taskRatio * 50);
      const habitPart = Math.round(habitRatio * 30);
      const statePart = Math.round(stateScore * .2);
      const score = taskPart + habitPart + statePart;
      const orbit = document.querySelector('.day-orbit');
      const status = score >= 70 ? 'Успешно' : score >= 50 ? 'Частично' : 'Не выполнено';
      const statusClass = score >= 70 ? 'score-success' : score >= 50 ? 'score-warning' : 'score-low';

      orbit.classList.remove('score-success', 'score-warning', 'score-low');
      orbit.classList.add(statusClass);
      document.querySelector('#day-progress').textContent = `${score}%`;
      document.querySelector('#day-score-status').textContent = status;
      document.querySelector('#daily-score-meta').textContent = `${score}%`;
      document.querySelector('#task-score-ratio').textContent = `${taskDone} / ${inputs.length}`;
      document.querySelector('#habit-score-ratio').textContent = `${habitDone} / ${rituals.length}`;
      document.querySelector('#task-score-part').textContent = `${taskPart} / 50`;
      document.querySelector('#habit-score-part').textContent = `${habitPart} / 30`;
      document.querySelector('#task-score-fill').style.setProperty('--part', `${Math.round(taskRatio * 100)}%`);
      document.querySelector('#habit-score-fill').style.setProperty('--part', `${Math.round(habitRatio * 100)}%`);
      document.querySelector('#day-score-gap').innerHTML = score >= 70
        ? 'Статус: <b>успешный день</b>'
        : score >= 50
          ? `До успеха: <b>${70 - score} пунктов</b>`
          : `До частичного: <b>${50 - score} пунктов</b>`;
    };

    const updateDay = () => {
      const done = inputs.filter((input) => input.checked).length;
      document.querySelector('#task-count').textContent = `${done} из ${inputs.length} завершено`;
      document.querySelector('#dialog-done').textContent = `${done}/${inputs.length}`;
      storage.set('orbit-daily-tasks', Object.fromEntries(tasks.map((task, index) => [task.dataset.taskId, inputs[index].checked])));
      updateDailyScore();
    };

    const updateRituals = () => {
      const done = rituals.filter((ritual) => ritual.classList.contains('done')).length;
      document.querySelector('#ritual-count').textContent = `${done} / ${rituals.length}`;
      document.querySelector('#dialog-rituals').textContent = `${done}/${rituals.length}`;
      storage.set('orbit-daily-rituals', rituals.map((ritual) => ritual.classList.contains('done')));
      updateDailyScore();
    };

    inputs.forEach((input) => input.addEventListener('change', updateDay));
    rituals.forEach((ritual) => ritual.addEventListener('click', () => {
      ritual.classList.toggle('done');
      updateRituals();
    }));

    document.querySelectorAll('.segment').forEach((segment) => segment.addEventListener('click', () => {
      document.querySelectorAll('.segment').forEach((item) => {
        const active = item === segment;
        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });
      const filter = segment.dataset.filter;
      tasks.forEach((task) => { task.hidden = filter !== 'all' && task.dataset.kind !== filter; });
    }));

    const dialog = document.querySelector('#day-summary');
    document.querySelector('[data-open-summary]').addEventListener('click', () => dialog.showModal());
    document.querySelector('[data-close-summary]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    });

    updateDay();
    updateRituals();
  }
})();
