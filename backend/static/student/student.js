let currentUser = null;
let _sim = null;

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

function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');
  if (view === 'simulacro') loadSimIdle();
}

async function loadSimIdle() {
  const c = document.getElementById('sim-container');
  c.innerHTML = '<div class="sim-empty">Cargando…</div>';
  try {
    const res = await fetch('/api/simulation/start', { method: 'POST' });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    _sim = { simulationId: data.simulation_id, questions: data.questions || [], currentIndex: 0, answers: [] };
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
  c.innerHTML = `
    <div class="sim-progress">
      <div class="sim-progress-bar"><div class="sim-progress-fill" style="width:${pct}%"></div></div>
      <div class="sim-progress-text">${current} / ${total}</div>
    </div>
    <div class="sim-question-img-wrap">
      <img class="sim-question-img" src="/uploads/${q.image_path}" alt="Pregunta ${current}" />
    </div>
    <div class="sim-options">${opts}</div>
    <button class="sim-nav-btn" onclick="${isLast ? 'submitSim()' : 'nextQuestion()'}">${isLast ? 'Entregar simulacro' : 'Siguiente'}</button>`;
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

async function submitSim() {
  const c = document.getElementById('sim-container');
  c.innerHTML = '<div class="sim-empty">Calculando resultados…</div>';
  const answers = _sim.questions
    .map((q, i) => ({ question_id: q.id, selected_option: _sim.answers[i] || null }))
    .filter(a => a.selected_option);
  try {
    const res = await fetch('/api/simulation/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simulation_id: _sim.simulationId, answers }),
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
  const breakdown = Object.entries(data.breakdown || {}).map(([subject, bd]) => {
    const pct = bd.total > 0 ? (bd.correct / bd.total * 100) : 0;
    return `<div class="sim-breakdown-row">
      <span class="bd-label">${SUBJECT_LABELS[subject] || subject}</span>
      <div class="bd-bar"><div class="bd-fill" style="width:${pct}%"></div></div>
      <span class="bd-val">${bd.correct}/${bd.total}</span>
    </div>`;
  }).join('');
  c.innerHTML = `
    <div class="sim-result-score">
      <div class="big-score" style="color:${scoreColor}">${data.score}<span class="pct">%</span></div>
      <div class="score-label">${data.correct} correctas de ${data.total}</div>
    </div>
    ${breakdown ? `<div class="sim-breakdown">${breakdown}</div>` : ''}
    <button class="sim-back-btn" onclick="loadSimIdle()">Hacer otro simulacro</button>`;
}

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
      document.getElementById('view-inicio').querySelector('.status-label').textContent = 'Cuenta inactiva';
      document.getElementById('view-inicio').querySelector('.status-msg').textContent   = 'Tu cuenta aún no ha sido activada. Contacta al equipo de PreUrbano.';
      document.getElementById('view-inicio').querySelector('.status-dot').style.background  = 'var(--red)';
      document.getElementById('view-inicio').querySelector('.status-dot').style.boxShadow   = 'none';
    }
  } catch { window.location.href = '/'; }
}

// Expose for inline onclick handlers
Object.assign(window, {
  logout,
  switchView,
  saveProfile,
  startSim,
  selectOption,
  nextQuestion,
  submitSim,
  loadSimIdle,
});

init();
