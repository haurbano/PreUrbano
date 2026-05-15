import { token, logout, subjectLabel, accuracyColorClass } from './shared.js?v=5';

// Values interpolated into innerHTML come from our own DB (controlled enum strings
// and server-generated paths). We still escape them to guard against unexpected data.
function _esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function _fetchJson(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) return null;
  return res.json();
}

function _difficultyBar(pct) {
  if (pct === null || pct === undefined) return '<span class="text-gray">—</span>';
  const cls = pct < 50 ? 'low' : pct < 70 ? 'mid' : 'high';
  return `
    <div class="difficulty-cell">
      <span class="difficulty-pct ${_esc(accuracyColorClass(pct))}">${pct}%</span>
      <div class="difficulty-bar" aria-hidden="true"><span class="${cls}" style="width:${pct}%"></span></div>
    </div>`;
}

function _updatedNow(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const time = new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date());
  el.textContent = `Actualizado a las ${time}`;
}

function _readHash() {
  const params = new URLSearchParams(location.hash.slice(1));
  return {
    subject: params.get('materia') || '',
    min: parseInt(params.get('min') || '5', 10),
  };
}

function _writeHash(subject, min) {
  const params = new URLSearchParams();
  if (subject) params.set('materia', subject);
  params.set('min', String(min));
  history.replaceState(null, '', '#' + params.toString());
}

export async function loadSubjectsRanking() {
  const wrap = document.getElementById('analytics-subjects');
  if (!wrap) return;
  wrap.innerHTML = '<p class="empty-state">Cargando…</p>';

  const data = await _fetchJson('/analytics/subjects');
  if (!data) { wrap.innerHTML = '<p class="empty-state" style="color:var(--red)">Error al cargar.</p>'; return; }
  if (!data.length) { wrap.innerHTML = '<p class="empty-state">Aún no hay intentos registrados.</p>'; return; }

  const rows = data.map((s, i) => `
    <tr${i === 0 ? ' class="row-focus"' : ''}>
      <td><span class="badge badge-${_esc(s.subject)}">${_esc(subjectLabel(s.subject))}</span></td>
      <td class="num">${s.question_count}</td>
      <td class="num">${s.attempts}</td>
      <td>${_difficultyBar(s.accuracy_pct)}</td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Materia</th><th>Preguntas</th><th>Intentos</th><th>Dificultad</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  _updatedNow('subjects-updated');
}

export async function loadHardestQuestions(minAttempts, subject) {
  const wrap = document.getElementById('analytics-hardest');
  if (!wrap) return;
  wrap.innerHTML = '<p class="empty-state">Cargando…</p>';

  const params = new URLSearchParams({ min_attempts: minAttempts });
  if (subject) params.set('subject', subject);
  const data = await _fetchJson('/analytics/hardest-questions?' + params);

  if (!data) { wrap.innerHTML = '<p class="empty-state" style="color:var(--red)">Error al cargar.</p>'; return; }
  if (!data.length) { wrap.innerHTML = '<p class="empty-state">Aún no hay preguntas con suficientes intentos.</p>'; return; }

  const rows = data.map(q => {
    const imgUrl = `https://preurbano.com/uploads/${_esc(q.image_path)}`;
    const id = parseInt(q.id, 10);
    return `
    <tr>
      <td style="padding:8px 16px">
        <img src="${imgUrl}"
             width="64" height="48" loading="lazy"
             alt="Pregunta #${id}"
             class="q-thumb"
             style="cursor:pointer"
             onclick="viewQuestionFromAnalytics(${id})" />
      </td>
      <td class="num" style="color:var(--muted);font-size:0.8rem">#${id}</td>
      <td><span class="badge badge-${_esc(q.subject)}">${_esc(subjectLabel(q.subject))}</span></td>
      <td>${_difficultyBar(q.accuracy_pct)}</td>
      <td class="num">${q.attempts}</td>
      <td>
        <button class="action-btn" onclick="viewQuestionFromAnalytics(${id})">Ver</button>
      </td>
    </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Imagen</th><th>ID</th><th>Materia</th><th>Dificultad</th><th>Intentos</th><th>Acción</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;

  _updatedNow('hardest-updated');
}

export function initAnalytics() {
  const { subject: hashSubject, min: hashMin } = _readHash();

  const subjectSel = document.getElementById('analytics-subject-filter');
  const minSel = document.getElementById('min-attempts-select');

  if (subjectSel && hashSubject) subjectSel.value = hashSubject;
  if (minSel && hashMin) minSel.value = String(hashMin);

  const currentSubject = () => (subjectSel ? subjectSel.value : '');
  const currentMin = () => (minSel ? parseInt(minSel.value, 10) : 5);

  loadSubjectsRanking();
  loadHardestQuestions(currentMin(), currentSubject());

  if (subjectSel) {
    subjectSel.addEventListener('change', () => {
      _writeHash(currentSubject(), currentMin());
      loadHardestQuestions(currentMin(), currentSubject());
    });
  }

  if (minSel) {
    minSel.addEventListener('change', () => {
      _writeHash(currentSubject(), currentMin());
      loadHardestQuestions(currentMin(), currentSubject());
    });
  }
}
