let currentUser = null;
let _sim = null;
let _timerInterval = null;
let _timerSecondsLeft = 0;
let _pendingNavView = null;

const SUBJECT_LABELS = {
  matematicas: 'Matemáticas',
  ciencias_naturales: 'Ciencias Naturales',
  lectura_critica: 'Lectura Crítica',
  sociales: 'Sociales y Ciudadanas',
  ingles: 'Inglés',
};

function logout() {
  window.location.href = '/auth/logout';
}

function renderUser(user) {
  currentUser = user;
  const avatarEl = document.getElementById('sb-avatar');
  if (user.picture) {
    avatarEl.innerHTML = `<img class="sidebar-avatar" src="${user.picture}" alt="Avatar" />`;
  } else {
    avatarEl.innerHTML = `<div class="sidebar-avatar-placeholder">👤</div>`;
  }
  document.getElementById('sb-name').textContent    = user.name;
  document.getElementById('sb-email').textContent   = user.email;
  document.getElementById('field-email').value      = user.email;
  document.getElementById('field-name').value       = user.name || '';
  document.getElementById('field-document').value   = user.document_id || '';
  document.getElementById('field-phone').value      = user.phone || '';
}

async function saveProfile() {
  const btn = document.getElementById('save-btn');
  const msg = document.getElementById('profile-msg');
  btn.disabled = true;
  msg.className = 'form-msg';
  msg.textContent = '';
  try {
    const res = await fetch('/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('field-name').value,
        document_id: document.getElementById('field-document').value || null,
        phone: document.getElementById('field-phone').value || null,
      }),
    });
    if (!res.ok) throw new Error();
    const updated = await res.json();
    currentUser = updated;
    document.getElementById('sb-name').textContent = updated.name;
    msg.className = 'form-msg ok';
    msg.textContent = 'Cambios guardados';
  } catch {
    msg.className = 'form-msg err';
    msg.textContent = 'Error al guardar cambios';
  } finally {
    btn.disabled = false;
  }
}

// ── Navigation (with sim guard) ──────────────────────────────────────────────

function _realSwitchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');
  if (view === 'inicio')    loadHome();
  if (view === 'simulacro') loadSimIdle();
  if (view === 'progreso')  loadProgress();
}

function switchView(view) {
  if (view !== 'simulacro' && _sim !== null && _sim.started === true) {
    showNavWarning(view);
    return;
  }
  _realSwitchView(view);
}

function showNavWarning(targetView) {
  _pendingNavView = targetView;
  document.getElementById('nav-warn-overlay').style.display = 'flex';
}

function navWarnCancel() {
  _pendingNavView = null;
  document.getElementById('nav-warn-overlay').style.display = 'none';
}

function navWarnConfirm() {
  document.getElementById('nav-warn-overlay').style.display = 'none';
  stopTimer();
  _sim = null;
  const view = _pendingNavView;
  _pendingNavView = null;
  _realSwitchView(view);
}

// ── Home ─────────────────────────────────────────────────────────────────────

async function loadHome() {
  const c = document.getElementById('home-container');
  if (!currentUser) return;

  if (!currentUser.is_active) {
    c.innerHTML = `
      <div class="welcome-card">
        <div><span class="status-dot" style="background:var(--red);box-shadow:none"></span><span class="status-label" style="color:#dc2626">Cuenta inactiva</span></div>
        <p class="status-msg">Tu cuenta aún no ha sido activada. Contacta al equipo de PreUrbano.</p>
      </div>`;
    return;
  }

  c.innerHTML = '<div class="sim-empty">Cargando…</div>';
  try {
    const res = await fetch('/api/student/progress');
    if (res.status === 401) { logout(); return; }
    if (!res.ok) throw new Error();
    renderHome(await res.json());
  } catch {
    c.innerHTML = '<div class="sim-empty">Error al cargar.</div>';
  }
}

function renderHome(data) {
  const c = document.getElementById('home-container');
  const firstName = (currentUser.name || '').split(' ')[0];

  if (data.total_simulations === 0) {
    c.innerHTML = `
      <div class="home-header">
        <h1 class="home-greeting">Hola, ${firstName}</h1>
        <p class="home-subtitle">¿Listo para tu primer simulacro?</p>
      </div>
      <div class="glass-card home-first-sim">
        <div class="home-first-sim-icon">📝</div>
        <h3>Comienza a practicar</h3>
        <p>Haz tu primer simulacro ICFES y empieza a ver tu progreso.</p>
        <button class="sim-start-btn" style="margin-top:20px" onclick="switchView('simulacro')">Iniciar simulacro</button>
      </div>`;
    return;
  }

  const avgPct = data.total_questions > 0
    ? Math.round((data.total_correct / data.total_questions) * 100)
    : 0;

  const recentRows = data.simulations.slice(0, 5).map(s => {
    const date = new Date(s.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const scoreColor = s.score_pct >= 60 ? 'var(--green)' : 'var(--red)';
    return `<div class="history-row">
      <span class="history-date">${date}</span>
      <span class="history-score" style="color:${scoreColor}">${s.score_pct}%</span>
      <span class="history-detail">${s.correct_answers} correctas de ${s.total_questions}</span>
    </div>`;
  }).join('');

  c.innerHTML = `
    <div class="home-header">
      <h1 class="home-greeting">Hola, ${firstName}</h1>
    </div>
    <div class="progress-cards home-stats">
      <div class="progress-card">
        <div class="progress-card-num">${data.total_simulations}</div>
        <div class="progress-card-label">Simulacros completados</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-num" style="color:${avgPct >= 60 ? 'var(--green)' : 'var(--red)'}">${avgPct}%</div>
        <div class="progress-card-label">Promedio global</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-num"><span style="color:var(--green)">${data.total_correct}</span> / <span style="color:var(--red)">${data.total_incorrect}</span></div>
        <div class="progress-card-label">Correctas / Incorrectas</div>
      </div>
    </div>
    <div class="home-bottom-grid">
      <div class="glass-card home-next-sim">
        <div class="home-section-label">Próximo Simulacro</div>
        <h3 class="home-next-sim-title">Simulacro ICFES</h3>
        <button class="sim-start-btn" onclick="switchView('simulacro')">Iniciar simulacro</button>
      </div>
      <div class="glass-card home-recent">
        <div class="home-section-label">Actividad Reciente</div>
        <div class="history-list">${recentRows}</div>
      </div>
    </div>`;
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function startTimer() {
  clearInterval(_timerInterval);
  _timerInterval = setInterval(() => {
    _timerSecondsLeft--;
    updateTimerDisplay();
    if (_timerSecondsLeft <= 0) {
      clearInterval(_timerInterval);
      _timerInterval = null;
      submitSim(true);
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(_timerInterval);
  _timerInterval = null;
}

function updateTimerDisplay() {
  const el = document.getElementById('sim-timer');
  if (!el) return;
  const mins = Math.floor(_timerSecondsLeft / 60);
  const secs = _timerSecondsLeft % 60;
  el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  el.classList.toggle('urgent', _timerSecondsLeft <= 120);
}

// ── Simulation ────────────────────────────────────────────────────────────────

async function loadSimIdle() {
  stopTimer();
  _sim = null;
  const c = document.getElementById('sim-container');
  c.innerHTML = '<div class="sim-empty">Cargando…</div>';
  try {
    const res = await fetch('/api/simulation/start', { method: 'POST' });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    _sim = {
      simulationId: data.simulation_id,
      questions: data.questions || [],
      currentIndex: 0,
      answers: [],
      timeLimitMinutes: data.time_limit_minutes || 0,
      started: false,
    };
    renderSimIdle(data.total_available || 0);
  } catch { renderSimIdle(0); }
}

function renderSimIdle(total) {
  const c = document.getElementById('sim-container');
  if (total === 0) {
    c.innerHTML = `<h2>Simulacro ICFES</h2><p class="sub">Prueba tus conocimientos con preguntas reales.</p><div class="sim-empty">No hay preguntas disponibles aún. Vuelve pronto.</div>`;
    return;
  }
  c.innerHTML = `<h2>Simulacro ICFES</h2><p class="sub">${total} pregunta${total !== 1 ? 's' : ''} disponible${total !== 1 ? 's' : ''}.</p><button class="sim-start-btn" onclick="startSim()">Iniciar simulacro</button>`;
}

function startSim() {
  if (!_sim || !_sim.questions.length) return;
  _sim.currentIndex = 0;
  _sim.answers = [];
  _sim.started = true;
  if (_sim.timeLimitMinutes > 0) {
    _timerSecondsLeft = _sim.timeLimitMinutes * 60;
    startTimer();
  }
  renderSimQuestion();
}

function renderSimQuestion() {
  const c = document.getElementById('sim-container');
  const q = _sim.questions[_sim.currentIndex];
  const total   = _sim.questions.length;
  const current = _sim.currentIndex + 1;
  const pct     = ((current - 1) / total * 100).toFixed(0);
  const selected = _sim.answers[_sim.currentIndex];
  const isLast   = _sim.currentIndex === total - 1;
  const opts = ['A', 'B', 'C', 'D'].map(opt =>
    `<button class="sim-option-btn${selected === opt ? ' selected' : ''}" onclick="selectOption('${opt}')">${opt}</button>`
  ).join('');
  const timerHtml = _sim.timeLimitMinutes > 0
    ? `<span class="sim-timer" id="sim-timer"></span>`
    : '';
  c.innerHTML = `
    <div class="sim-progress">
      <div class="sim-progress-bar"><div class="sim-progress-fill" style="width:${pct}%"></div></div>
      <div class="sim-progress-text">${current} / ${total}</div>
      ${timerHtml}
    </div>
    <div class="sim-question-img-wrap">
      <img class="sim-question-img" src="/uploads/${q.image_path}" alt="Pregunta ${current}" />
    </div>
    <div class="sim-options">${opts}</div>
    <button class="sim-nav-btn" onclick="${isLast ? 'submitSim()' : 'nextQuestion()'}">${isLast ? 'Entregar simulacro' : 'Siguiente'}</button>`;
  if (_sim.timeLimitMinutes > 0) updateTimerDisplay();
}

function selectOption(opt) {
  _sim.answers[_sim.currentIndex] = opt;
  renderSimQuestion();
}

function nextQuestion() {
  if (_sim.currentIndex < _sim.questions.length - 1) {
    _sim.currentIndex++;
    renderSimQuestion();
  }
}

async function submitSim(timedOut = false) {
  stopTimer();
  const c = document.getElementById('sim-container');
  c.innerHTML = '<div class="sim-empty">Calculando resultados…</div>';
  const answers = _sim.questions
    .map((q, i) => ({ question_id: q.id, selected_option: _sim.answers[i] || null }))
    .filter(a => a.selected_option);
  try {
    const res = await fetch('/api/simulation/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: _sim.simulationId, answers, timed_out: timedOut }),
    });
    if (res.status === 401) { logout(); return; }
    renderSimResult(await res.json());
  } catch {
    c.innerHTML = '<div class="sim-empty">Error al enviar. Intenta de nuevo.</div>';
  }
}

function renderSimResult(data) {
  const c = document.getElementById('sim-container');
  const scoreColor = data.score >= 60 ? 'var(--green)' : 'var(--red)';
  const timeoutBanner = data.timed_out
    ? `<div class="sim-timeout-banner">⏱ Tiempo agotado — el simulacro fue enviado automáticamente</div>`
    : '';
  const breakdown = Object.entries(data.breakdown || {}).map(([subject, bd]) => {
    const pct = bd.total > 0 ? (bd.correct / bd.total * 100) : 0;
    return `<div class="sim-breakdown-row">
      <span class="bd-label">${SUBJECT_LABELS[subject] || subject}</span>
      <div class="bd-bar"><div class="bd-fill" style="width:${pct}%"></div></div>
      <span class="bd-val">${bd.correct}/${bd.total}</span>
    </div>`;
  }).join('');
  c.innerHTML = `
    ${timeoutBanner}
    <div class="sim-result-score">
      <div class="big-score" style="color:${scoreColor}">${data.score}<span class="pct">%</span></div>
      <div class="score-label">${data.correct} correctas de ${data.total}</div>
    </div>
    ${breakdown ? `<div class="sim-breakdown">${breakdown}</div>` : ''}
    <button class="sim-back-btn" onclick="loadSimIdle()">Hacer otro simulacro</button>`;
}

// ── Progress ──────────────────────────────────────────────────────────────────

async function loadProgress() {
  const c = document.getElementById('progress-container');
  c.innerHTML = '<div class="sim-empty">Cargando…</div>';
  try {
    const res = await fetch('/api/student/progress');
    if (res.status === 401) { logout(); return; }
    if (!res.ok) throw new Error();
    renderProgress(await res.json());
  } catch {
    c.innerHTML = '<div class="sim-empty">Error al cargar el progreso.</div>';
  }
}

function renderProgress(data) {
  const c = document.getElementById('progress-container');

  if (data.total_simulations === 0) {
    c.innerHTML = `
      <div class="progress-empty">
        <div class="progress-empty-icon">📊</div>
        <p>Aún no has completado simulacros.</p>
        <button class="sim-start-btn" style="max-width:260px" onclick="switchView('simulacro')">Hacer mi primer simulacro</button>
      </div>`;
    return;
  }

  const avgPct = data.total_questions > 0
    ? Math.round((data.total_correct / data.total_questions) * 100)
    : 0;

  const cards = `
    <div class="progress-cards">
      <div class="progress-card">
        <div class="progress-card-num">${data.total_simulations}</div>
        <div class="progress-card-label">Simulacros completados</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-num" style="color:${avgPct >= 60 ? 'var(--green)' : 'var(--red)'}">${avgPct}%</div>
        <div class="progress-card-label">Promedio global</div>
      </div>
      <div class="progress-card">
        <div class="progress-card-num"><span style="color:var(--green)">${data.total_correct}</span> / <span style="color:var(--red)">${data.total_incorrect}</span></div>
        <div class="progress-card-label">Correctas / Incorrectas</div>
      </div>
    </div>`;

  const subjectRows = Object.entries(data.by_subject).map(([subject, bd]) => {
    const pct = bd.total > 0 ? (bd.correct / bd.total * 100) : 0;
    return `<div class="sim-breakdown-row">
      <span class="bd-label">${SUBJECT_LABELS[subject] || subject}</span>
      <div class="bd-bar"><div class="bd-fill" style="width:${pct}%"></div></div>
      <span class="bd-val">${bd.correct}/${bd.total}</span>
    </div>`;
  }).join('');

  const historyRows = data.simulations.map(s => {
    const date = new Date(s.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
    const scoreColor = s.score_pct >= 60 ? 'var(--green)' : 'var(--red)';
    return `<div class="history-row">
      <span class="history-date">${date}</span>
      <span class="history-score" style="color:${scoreColor}">${s.score_pct}%</span>
      <span class="history-detail">${s.correct_answers} correctas de ${s.total_questions}</span>
    </div>`;
  }).join('');

  c.innerHTML = `
    ${cards}
    <div class="progress-section-title">Por materia</div>
    <div class="sim-breakdown">${subjectRows}</div>
    <div class="progress-section-title">Historial</div>
    <div class="history-list">${historyRows}</div>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  localStorage.removeItem('pu_user_token');
  try {
    const res = await fetch('/auth/me');
    if (!res.ok) { window.location.href = '/'; return; }
    const user = await res.json();
    renderUser(user);
    document.getElementById('app').classList.add('visible');
    if (!user.is_active) {
      document.getElementById('nav-simulacro').style.display = 'none';
      document.getElementById('nav-progreso').style.display  = 'none';
    }
    loadHome();
  } catch { window.location.href = '/'; }
}

// Expose for inline onclick handlers
Object.assign(window, {
  logout,
  switchView,
  saveProfile,
  loadHome,
  startSim,
  selectOption,
  nextQuestion,
  submitSim,
  loadSimIdle,
  loadProgress,
  navWarnCancel,
  navWarnConfirm,
});

init();
