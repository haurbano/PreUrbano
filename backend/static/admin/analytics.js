import { token, logout, subjectLabel, accuracyColorClass } from './shared.js?v=5';

async function _fetchJson(url) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
  if (res.status === 401) { logout(); return null; }
  if (!res.ok) return null;
  return res.json();
}

function _accuracyCell(pct) {
  const cls = accuracyColorClass(pct);
  const label = pct === null || pct === undefined ? '—' : `${pct}%`;
  return `<td><span class="${cls}">${label}</span></td>`;
}

export async function loadSubjectsRanking() {
  const wrap = document.getElementById('analytics-subjects');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:var(--muted);padding:8px 0">Cargando...</p>';
  const data = await _fetchJson('/analytics/subjects');
  if (!data) { wrap.innerHTML = '<p style="color:var(--red)">Error al cargar.</p>'; return; }
  if (!data.length) { wrap.innerHTML = '<p style="color:var(--muted)">Sin datos.</p>'; return; }
  const rows = data.map(s => `
    <tr>
      <td><span class="badge badge-${s.subject}">${subjectLabel(s.subject)}</span></td>
      <td>${s.question_count}</td>
      <td>${s.attempts}</td>
      ${_accuracyCell(s.accuracy_pct)}
    </tr>`).join('');
  wrap.innerHTML = `
    <table>
      <thead><tr><th>Materia</th><th>Preguntas</th><th>Intentos</th><th>Acierto %</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function loadHardestQuestions(minAttempts) {
  const wrap = document.getElementById('analytics-hardest');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:var(--muted);padding:8px 0">Cargando...</p>';
  const params = new URLSearchParams({ min_attempts: minAttempts });
  const data = await _fetchJson('/analytics/hardest-questions?' + params);
  if (!data) { wrap.innerHTML = '<p style="color:var(--red)">Error al cargar.</p>'; return; }
  if (!data.length) { wrap.innerHTML = '<p style="color:var(--muted)">No hay preguntas con suficientes intentos.</p>'; return; }
  const rows = data.map(q => `
    <tr>
      <td style="color:var(--muted);font-size:0.8rem">#${q.id}</td>
      <td><span class="badge badge-${q.subject}">${subjectLabel(q.subject)}</span></td>
      ${_accuracyCell(q.accuracy_pct)}
      <td>${q.attempts}</td>
      <td>
        <button class="action-btn" onclick="viewQuestionFromAnalytics(${q.id})">Ver</button>
      </td>
    </tr>`).join('');
  wrap.innerHTML = `
    <table>
      <thead><tr><th>ID</th><th>Materia</th><th>Acierto %</th><th>Intentos</th><th>Ver</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export function initAnalytics() {
  loadSubjectsRanking();
  const sel = document.getElementById('min-attempts-select');
  const minAttempts = sel ? parseInt(sel.value) : 5;
  loadHardestQuestions(minAttempts);
  if (sel) {
    sel.addEventListener('change', () => loadHardestQuestions(parseInt(sel.value)));
  }
}
