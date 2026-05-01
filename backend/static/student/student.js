const _imgRetries = {};

function handleImgError(img, questionId, imagePath) {
  const key = `q${questionId}`;
  _imgRetries[key] = (_imgRetries[key] || 0) + 1;
  const attempt = _imgRetries[key];
  if (attempt <= 2) {
    setTimeout(() => {
      img.src = `/uploads/${imagePath}?r=${attempt}&t=${Date.now()}`;
    }, 1500 * attempt);
  } else {
    img.style.display = 'none';
    const msg = document.createElement('div');
    msg.className = 'sim-img-error';
    msg.textContent = 'No se pudo cargar la imagen. Intenta recargar la página.';
    img.parentNode.insertBefore(msg, img.nextSibling);
    reportImageError(questionId, imagePath, attempt);
    delete _imgRetries[key];
  }
}

async function reportImageError(questionId, imagePath, attempts) {
  try {
    await fetch('/api/log/image-error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ question_id: questionId, image_path: imagePath, attempts }),
    });
  } catch {}
}

let currentUser = null;
let _sim = null;
let _timerInterval = null;
let _timerSecondsLeft = 0;
let _curado = null;
let _curadoTimerInterval = null;
let _curadoTimerSecondsLeft = 0;
let _pendingNavView = null;

const SUBJECT_LABELS = {
  matematicas: 'Matemáticas',
  ciencias_naturales: 'Ciencias Naturales',
  lectura_critica: 'Lectura Crítica',
  sociales: 'Sociales y Ciudadanas',
  ingles: 'Inglés',
};

const SUBJECTS = ['matematicas', 'ciencias_naturales', 'lectura_critica', 'sociales', 'ingles'];

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
  document.getElementById('field-email').value       = user.email;
  document.getElementById('field-name').value        = user.name || '';
  document.getElementById('field-document').value    = user.document_id || '';
  document.getElementById('field-phone').value       = user.phone || '';
  document.getElementById('field-grade').value       = user.grade || '';
  document.getElementById('field-institution').value = user.institution || '';
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
        grade: document.getElementById('field-grade').value || null,
        institution: document.getElementById('field-institution').value || null,
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
  if (view === 'curado')    loadCuradoIdle();
  if (view === 'progreso')  loadProgress();
}

function switchView(view) {
  if (view !== 'simulacro' && _sim !== null && _sim.started === true) {
    showNavWarning(view);
    return;
  }
  if (view !== 'curado' && _curado !== null && _curado.started === true) {
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
  stopCuradoTimer();
  _sim = null;
  _curado = null;
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
        <p>Haz tu primera práctica ICFES y empieza a ver tu progreso.</p>
        <button class="sim-start-btn" style="margin-top:20px" onclick="switchView('simulacro')">Iniciar práctica</button>
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
        <div class="progress-card-label">Prácticas completadas</div>
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
        <div class="home-section-label">Próxima Práctica</div>
        <h3 class="home-next-sim-title">Práctica ICFES</h3>
        <button class="sim-start-btn" onclick="switchView('simulacro')">Iniciar práctica</button>
      </div>
      <div class="glass-card home-recent">
        <div class="home-section-label">Actividad Reciente</div>
        <div class="history-list">${recentRows}</div>
      </div>
    </div>`;
}

// ── Timer (práctica) ──────────────────────────────────────────────────────────

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

// ── Práctica aleatoria ────────────────────────────────────────────────────────

async function loadSimIdle() {
  stopTimer();
  _sim = null;
  let availableSubjects = SUBJECTS;
  try {
    const res = await fetch('/api/simulation/subjects');
    if (res.ok) {
      const data = await res.json();
      if (data.subjects && data.subjects.length > 0) availableSubjects = data.subjects;
    }
  } catch (_) {}
  renderSimConfig(availableSubjects);
}

function renderSimConfig(availableSubjects = SUBJECTS) {
  const c = document.getElementById('sim-container');
  const subjectOptions = availableSubjects.map(key => {
    const label = SUBJECT_LABELS[key];
    return `<label class="sim-subject-toggle">
      <input type="checkbox" value="${key}" checked />
      <span class="sim-toggle-label">${label}</span>
    </label>`;
  }).join('');

  c.innerHTML = `
    <div class="sim-config-screen">
      <h2>Práctica ICFES</h2>
      <p class="sim-config-subtitle">Elige las materias y la cantidad de preguntas</p>
      <div class="sim-subject-toggles">${subjectOptions}</div>
      <div class="sim-total-row">
        <label class="sim-total-label">Preguntas por materia:</label>
        <select id="sim-total-select">
          <option value="5">5</option>
          <option value="10">10</option>
          <option value="15">15</option>
          <option value="20" selected>20</option>
          <option value="25">25</option>
          <option value="30">30</option>
        </select>
      </div>
      <button class="sim-start-btn" onclick="startSim()">Iniciar práctica</button>
    </div>`;
}

async function startSim() {
  const selectedSubjects = Array.from(
    document.querySelectorAll('.sim-subject-toggle input:checked')
  ).map(el => el.value);

  if (selectedSubjects.length === 0) {
    alert('Selecciona al menos una materia.');
    return;
  }

  const totalQuestions = parseInt(document.getElementById('sim-total-select').value, 10);

  const c = document.getElementById('sim-container');
  c.innerHTML = '<div class="sim-empty">Cargando preguntas...</div>';

  try {
    const res = await fetch('/api/simulation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subjects: selectedSubjects, total_questions: totalQuestions }),
    });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    _sim = {
      simulationId: data.simulation_id,
      questions: data.questions || [],
      currentIndex: 0,
      answers: [],
      answered: [],
      timeLimitMinutes: data.time_limit_minutes || 0,
      started: false,
    };

    if (!_sim.questions.length) {
      c.innerHTML = `<h2>Práctica ICFES</h2><p class="sub">No hay preguntas disponibles para la selección elegida.</p><button class="sim-start-btn" style="margin-top:16px" onclick="loadSimIdle()">Volver</button>`;
      return;
    }

    _sim.currentIndex = 0;
    _sim.answers = [];
    _sim.answered = [];
    _sim.started = true;
    if (_sim.timeLimitMinutes > 0) {
      _timerSecondsLeft = _sim.timeLimitMinutes * 60;
      startTimer();
    }
    renderSimQuestion();
  } catch {
    c.innerHTML = `<p class="sim-empty" style="color:var(--red)">Error al cargar preguntas.</p><button class="sim-start-btn" style="margin-top:16px" onclick="loadSimIdle()">Volver</button>`;
  }
}

function renderSimQuestion() {
  const c = document.getElementById('sim-container');
  const q = _sim.questions[_sim.currentIndex];
  const total   = _sim.questions.length;
  const current = _sim.currentIndex + 1;
  const pct     = ((current - 1) / total * 100).toFixed(0);
  const selected = _sim.answers[_sim.currentIndex];
  const isLast   = _sim.currentIndex === total - 1;
  const isAnswered = _sim.answered[_sim.currentIndex];
  const opts = ['A', 'B', 'C', 'D'].map(opt => {
    const disabled = isAnswered ? ' disabled' : '';
    return `<button class="sim-option-btn${selected === opt ? ' selected' : ''}" onclick="selectOption('${opt}')"${disabled}>${opt}</button>`
  }).join('');
  const timerHtml = _sim.timeLimitMinutes > 0
    ? `<span class="sim-timer" id="sim-timer"></span>`
    : '';

  c.innerHTML = `
    <div class="sim-subject-badge">${SUBJECT_LABELS[q.subject] || q.subject}</div>
    <div class="sim-progress">
      <div class="sim-progress-bar"><div class="sim-progress-fill" style="width:${pct}%"></div></div>
      <div class="sim-progress-text">${current} / ${total}</div>
      ${timerHtml}
    </div>
    <div class="sim-question-img-wrap">
      <img class="sim-question-img" src="/uploads/${q.image_path}" onerror="handleImgError(this,${q.id},'${q.image_path}')" alt="Pregunta ${current}" />
    </div>
    <div class="sim-options">${opts}</div>
    <button class="sim-nav-btn" onclick="${isLast ? 'submitSim()' : 'nextQuestion()'}">${isLast ? 'Entregar práctica' : 'Siguiente'}</button>`;
  if (_sim.timeLimitMinutes > 0) updateTimerDisplay();
  if (isAnswered) {
    const correct = q.correct_option;
    const wasCorrect = selected === correct;
    showFeedback(wasCorrect ? 'correct' : 'incorrect', wasCorrect ? '¡Correcto! 🎉' : `Incorrecto. Respuesta correcta: ${correct}`);
  }
}

function selectOption(opt) {
  const idx = _sim.currentIndex;
  if (_sim.answered[idx]) return;
  if (_sim.answers[idx]) return;
  _sim.answers[idx] = opt;
  _sim.answered[idx] = true;
  const correct = _sim.questions[idx].correct_option;
  showFeedback(opt === correct ? 'correct' : 'incorrect', opt === correct ? '¡Correcto! 🎉' : `Incorrecto. Respuesta correcta: ${correct}`);
  renderSimQuestion();
}

function showFeedback(type, message) {
  const existing = document.getElementById('sim-feedback');
  if (existing) {
    existing.className = `sim-feedback ${type}`;
    existing.textContent = message;
    return;
  }
  const feedback = document.createElement('div');
  feedback.id = 'sim-feedback';
  feedback.className = `sim-feedback ${type}`;
  feedback.textContent = message;
  document.querySelector('.sim-options').appendChild(feedback);
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
    ? `<div class="sim-timeout-banner">⏱ Tiempo agotado — la práctica fue enviada automáticamente</div>`
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
    <button class="sim-back-btn" onclick="loadSimIdle()">Hacer otra práctica</button>`;
}

// ── Simulacro curado ──────────────────────────────────────────────────────────

function _escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadCuradoIdle() {
  stopCuradoTimer();
  _curado = null;
  const c = document.getElementById('curado-container');
  c.innerHTML = '<div class="sim-card"><div class="sim-empty">Cargando…</div></div>';
  try {
    const res = await fetch('/api/simulacro/active');
    if (res.status === 401) { logout(); return; }
    if (!res.ok) throw new Error();
    renderCuradoStatus(await res.json());
  } catch {
    c.innerHTML = '<div class="sim-card"><div class="sim-empty">Error al cargar.</div></div>';
  }
}

function renderCuradoStatus(data) {
  const c = document.getElementById('curado-container');

  if (!data.available && !data.already_taken) {
    c.innerHTML = `
      <div class="sim-card" style="text-align:center;max-width:480px;margin:0 auto">
        <div style="font-size:2.5rem;margin-bottom:16px">📋</div>
        <h2 style="margin-bottom:8px">Sin simulacro disponible</h2>
        <p class="sub">No hay un simulacro activo en este momento. ¡Vuelve pronto!</p>
      </div>`;
    return;
  }

  if (data.already_taken) {
    const r = data.last_result;
    const scoreColor = r && r.score >= 60 ? 'var(--green)' : 'var(--red)';
    const timeoutBanner = r && r.timed_out
      ? `<div class="sim-timeout-banner">⏱ Tiempo agotado — el simulacro fue enviado automáticamente</div>`
      : '';
    const breakdown = r ? Object.entries(r.breakdown || {}).map(([subject, bd]) => {
      const pct = bd.total > 0 ? (bd.correct / bd.total * 100) : 0;
      return `<div class="sim-breakdown-row">
        <span class="bd-label">${SUBJECT_LABELS[subject] || subject}</span>
        <div class="bd-bar"><div class="bd-fill" style="width:${pct}%"></div></div>
        <span class="bd-val">${bd.correct}/${bd.total}</span>
      </div>`;
    }).join('') : '';
    c.innerHTML = `
      <div class="sim-card" style="max-width:680px;margin:0 auto">
        <h2 style="margin-bottom:4px">${_escHtml(data.name)}</h2>
        <p class="sub">Ya completaste este simulacro.</p>
        ${timeoutBanner}
        ${r ? `<div class="sim-result-score">
          <div class="big-score" style="color:${scoreColor}">${r.score}<span class="pct">%</span></div>
          <div class="score-label">${r.correct} correctas de ${r.total}</div>
        </div>` : ''}
        ${breakdown ? `<div class="sim-breakdown">${breakdown}</div>` : ''}
        <p style="font-size:0.82rem;color:var(--muted);text-align:center;margin-top:16px">Cuando el admin publique un nuevo simulacro, podrás participar.</p>
      </div>`;
    return;
  }

  if (data.available) {
    const timeInfo = data.time_limit_minutes > 0
      ? `${data.question_count} preguntas · ${data.time_limit_minutes} min`
      : `${data.question_count} preguntas · Sin límite de tiempo`;
    c.innerHTML = `
      <div class="sim-card" style="text-align:center;max-width:480px;margin:0 auto">
        <div style="font-size:2.5rem;margin-bottom:16px">📝</div>
        <h2 style="margin-bottom:8px">${_escHtml(data.name)}</h2>
        <p class="sub">${timeInfo}</p>
        <span class="curado-badge">Solo puedes hacerlo una vez</span>
        <button class="sim-start-btn" style="margin-top:24px" onclick="startCurado()">Iniciar simulacro</button>
      </div>`;
  }
}

async function startCurado() {
  const c = document.getElementById('curado-container');
  c.innerHTML = '<div class="sim-card"><div class="sim-empty">Cargando preguntas…</div></div>';
  try {
    const res = await fetch('/api/simulacro/start', { method: 'POST' });
    if (res.status === 401) { logout(); return; }
    if (res.status === 409) { loadCuradoIdle(); return; }
    if (!res.ok) throw new Error();
    const data = await res.json();

    _curado = {
      simulacroId: data.simulacro_id,
      sessionId: data.session_id,
      name: data.name,
      questions: data.questions || [],
      currentIndex: 0,
      answers: [],
      answered: [],
      timeLimitMinutes: data.time_limit_minutes || 0,
      started: true,
    };

    if (!_curado.questions.length) {
      c.innerHTML = `<div class="sim-card"><p class="sim-empty">Sin preguntas en este simulacro.</p><button class="sim-back-btn" style="margin-top:16px" onclick="loadCuradoIdle()">Volver</button></div>`;
      return;
    }

    if (_curado.timeLimitMinutes > 0) {
      _curadoTimerSecondsLeft = _curado.timeLimitMinutes * 60;
      startCuradoTimer();
    }
    renderCuradoQuestion();
  } catch {
    c.innerHTML = `<div class="sim-card"><p class="sim-empty" style="color:var(--red)">Error al cargar el simulacro.</p><button class="sim-back-btn" style="margin-top:16px" onclick="loadCuradoIdle()">Volver</button></div>`;
  }
}

function startCuradoTimer() {
  clearInterval(_curadoTimerInterval);
  _curadoTimerInterval = setInterval(() => {
    _curadoTimerSecondsLeft--;
    updateCuradoTimerDisplay();
    if (_curadoTimerSecondsLeft <= 0) {
      clearInterval(_curadoTimerInterval);
      _curadoTimerInterval = null;
      submitCurado(true);
    }
  }, 1000);
}

function stopCuradoTimer() {
  clearInterval(_curadoTimerInterval);
  _curadoTimerInterval = null;
}

function updateCuradoTimerDisplay() {
  const el = document.getElementById('curado-timer');
  if (!el) return;
  const mins = Math.floor(_curadoTimerSecondsLeft / 60);
  const secs = _curadoTimerSecondsLeft % 60;
  el.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  el.classList.toggle('urgent', _curadoTimerSecondsLeft <= 120);
}

function renderCuradoQuestion() {
  const c = document.getElementById('curado-container');
  const q = _curado.questions[_curado.currentIndex];
  const total = _curado.questions.length;
  const current = _curado.currentIndex + 1;
  const pct = ((current - 1) / total * 100).toFixed(0);
  const selected = _curado.answers[_curado.currentIndex];
  const isLast = _curado.currentIndex === total - 1;
  const isAnswered = _curado.answered[_curado.currentIndex];
  const opts = ['A', 'B', 'C', 'D'].map(opt => {
    const disabled = isAnswered ? ' disabled' : '';
    return `<button class="sim-option-btn${selected === opt ? ' selected' : ''}" onclick="selectCuradoOption('${opt}')"${disabled}>${opt}</button>`;
  }).join('');
  const timerHtml = _curado.timeLimitMinutes > 0
    ? `<span class="sim-timer" id="curado-timer"></span>`
    : '';

  c.innerHTML = `
    <div class="sim-card">
      <div class="sim-subject-badge">${SUBJECT_LABELS[q.subject] || q.subject}</div>
      <div class="sim-progress">
        <div class="sim-progress-bar"><div class="sim-progress-fill" style="width:${pct}%"></div></div>
        <div class="sim-progress-text">${current} / ${total}</div>
        ${timerHtml}
      </div>
      <div class="sim-question-img-wrap">
        <img class="sim-question-img" src="/uploads/${q.image_path}" onerror="handleImgError(this,${q.id},'${q.image_path}')" alt="Pregunta ${current}" />
      </div>
      <div class="sim-options">${opts}</div>
      <button class="sim-nav-btn" onclick="${isLast ? 'submitCurado()' : 'nextCuradoQuestion()'}">
        ${isLast ? 'Entregar simulacro' : 'Siguiente'}
      </button>
    </div>`;
  if (_curado.timeLimitMinutes > 0) updateCuradoTimerDisplay();
  if (isAnswered) {
    const correct = q.correct_option;
    const wasCorrect = selected === correct;
    const fb = document.createElement('div');
    fb.id = 'curado-feedback';
    fb.className = `sim-feedback ${wasCorrect ? 'correct' : 'incorrect'}`;
    fb.textContent = wasCorrect ? '¡Correcto! 🎉' : `Incorrecto. Respuesta correcta: ${correct}`;
    document.querySelector('.sim-options').appendChild(fb);
  }
}

function selectCuradoOption(opt) {
  const idx = _curado.currentIndex;
  if (_curado.answered[idx]) return;
  _curado.answers[idx] = opt;
  _curado.answered[idx] = true;
  const correct = _curado.questions[idx].correct_option;
  const fb = document.createElement('div');
  fb.id = 'curado-feedback';
  fb.className = `sim-feedback ${opt === correct ? 'correct' : 'incorrect'}`;
  fb.textContent = opt === correct ? '¡Correcto! 🎉' : `Incorrecto. Respuesta correcta: ${correct}`;
  document.querySelector('.sim-options').appendChild(fb);
  renderCuradoQuestion();
}

function nextCuradoQuestion() {
  if (_curado.currentIndex < _curado.questions.length - 1) {
    _curado.currentIndex++;
    renderCuradoQuestion();
  }
}

async function submitCurado(timedOut = false) {
  stopCuradoTimer();
  const c = document.getElementById('curado-container');
  c.innerHTML = '<div class="sim-card"><div class="sim-empty">Calculando resultados…</div></div>';
  const answers = _curado.questions
    .map((q, i) => ({ question_id: q.id, selected_option: _curado.answers[i] || null }))
    .filter(a => a.selected_option);
  try {
    const res = await fetch('/api/simulacro/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        simulacro_id: _curado.simulacroId,
        session_id: _curado.sessionId,
        answers,
        timed_out: timedOut,
      }),
    });
    if (res.status === 401) { logout(); return; }
    _curado = null;
    renderCuradoResult(await res.json());
  } catch {
    c.innerHTML = '<div class="sim-card"><div class="sim-empty">Error al enviar. Intenta de nuevo.</div></div>';
  }
}

function renderCuradoResult(data) {
  const c = document.getElementById('curado-container');
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
    <div class="sim-card" style="max-width:680px;margin:0 auto">
      ${timeoutBanner}
      <div class="sim-result-score">
        <div class="big-score" style="color:${scoreColor}">${data.score}<span class="pct">%</span></div>
        <div class="score-label">${data.correct} correctas de ${data.total}</div>
      </div>
      ${breakdown ? `<div class="sim-breakdown">${breakdown}</div>` : ''}
    </div>`;
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
        <p>Aún no has completado prácticas.</p>
        <button class="sim-start-btn" style="max-width:260px" onclick="switchView('simulacro')">Hacer mi primera práctica</button>
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
        <div class="progress-card-label">Prácticas completadas</div>
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
      document.getElementById('nav-curado').style.display   = 'none';
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
  loadCuradoIdle,
  startCurado,
  selectCuradoOption,
  nextCuradoQuestion,
  submitCurado,
});

init();
