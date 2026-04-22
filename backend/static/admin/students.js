import { token, logout } from './shared.js';

const SUBJECT_LABELS = {
  matematicas: 'Matemáticas',
  ciencias_naturales: 'Ciencias',
  lectura_critica: 'Lectura',
  sociales: 'Sociales',
  ingles: 'Inglés',
};

const SUBJECT_COLORS = {
  matematicas: '#a59dff',
  ciencias_naturales: '#34d399',
  lectura_critica: '#7dd3fc',
  sociales: '#fbbf24',
  ingles: '#f87171',
};

export async function loadStudents() {
  const wrap = document.getElementById('table-students');
  wrap.innerHTML = '<p style="color:var(--muted);padding:16px">Cargando...</p>';
  try {
    const res = await fetch('/students', { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    document.getElementById('stat-students-total').textContent = data.total;
    document.getElementById('stat-students-active').textContent = data.items.filter(s => s.is_active).length;
    document.getElementById('stat-students-sim').textContent = data.items.filter(s => s.total_simulations > 0).length;

    if (!data.items.length) {
      wrap.innerHTML = '<div class="empty-state">Aún no hay estudiantes registrados.</div>';
      return;
    }

    const rows = data.items.map(s => {
      const scoreClass = s.avg_score >= 60 ? 'high' : 'low';
      const lastDate = s.last_sim_date
        ? new Date(s.last_sim_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
        : '—';
      return `<tr class="clickable" onclick='openStudentModal(${JSON.stringify(s)})'>
        <td>
          ${s.picture ? `<img class="user-avatar" src="${s.picture}" referrerpolicy="no-referrer" />` : ''}
          ${s.name}
        </td>
        <td style="color:var(--muted)">${s.email}</td>
        <td style="text-align:center">${s.total_simulations}</td>
        <td style="text-align:center"><span class="student-score ${scoreClass}">${s.avg_score || 0}%</span></td>
        <td style="color:var(--muted)">${lastDate}</td>
      </tr>`;
    }).join('');

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Nombre</th><th>Email</th><th>Sims (10)</th><th>Promedio</th><th>Último</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  } catch { wrap.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar datos.</p>'; }
}

window.openStudentModal = async function(s) {
  const modal = document.getElementById('student-modal');
  document.getElementById('smodal-avatar').innerHTML = s.picture
    ? `<img class="modal-avatar" src="${s.picture}" referrerpolicy="no-referrer" />`
    : `<div class="modal-avatar-placeholder">👤</div>`;
  document.getElementById('smodal-name').textContent = s.name;
  document.getElementById('smodal-email').textContent = s.email;

  const scoreClass = s.avg_score >= 60 ? 'high' : 'low';
  document.getElementById('smodal-stats').innerHTML = `
    <div class="modal-field"><span class="lbl">Simulacros (últimos 10)</span><span class="val">${s.total_simulations}</span></div>
    <div class="modal-field"><span class="lbl">Promedio score</span><span class="val student-score ${scoreClass}">${s.avg_score || 0}%</span></div>
    <div class="modal-field"><span class="lbl">Correctas / Preguntas</span><span class="val">${s.total_correct} / ${s.total_questions}</span></div>
    <div class="modal-field"><span class="lbl">Último simulacro</span><span class="val">${s.last_sim_date ? new Date(s.last_sim_date).toLocaleString('es-CO') : '—'}</span></div>`;

  try {
    const res = await fetch(`/students/${s.user_id}/simulations`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const simData = await res.json();

    if (!simData.items.length) {
      document.getElementById('smodal-simulations').innerHTML = '<p style="color:var(--muted);font-size:0.85rem;margin-top:16px">Sin simulacros aún.</p>';
    } else {
      const simRows = simData.items.map(sim => {
        const simScoreClass = sim.score_pct >= 60 ? 'high' : 'low';
        const bdChips = Object.entries(sim.breakdown || {}).map(([subj, bd]) => {
          const color = SUBJECT_COLORS[subj] || '#999';
          return `<span class="bd-mini" style="background:${color}22;color:${color}">${SUBJECT_LABELS[subj] || subj}: ${bd.correct}/${bd.total}</span>`;
        }).join('');
        return `<tr>
          <td style="color:var(--muted);white-space:nowrap">${new Date(sim.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
          <td><span class="student-score ${simScoreClass}" style="font-weight:700">${sim.score_pct}%</span></td>
          <td>${sim.correct_answers}/${sim.total_questions}</td>
          <td>${sim.timed_out ? '<span style="color:var(--red);font-size:0.78rem">⏱ Tiempo</span>' : '—'}</td>
          <td><div class="sim-breakdown-cell">${bdChips}</div></td>
        </tr>`;
      }).join('');

      document.getElementById('smodal-simulations').innerHTML = `
        <div style="font-size:0.75rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-top:20px;margin-bottom:4px">Últimos simulacros</div>
        <table class="sim-summary-table">
          <thead><tr><th>Fecha</th><th>Score</th><th>Correctas</th><th>Estado</th><th>Por materia</th></tr></thead>
          <tbody>${simRows}</tbody>
        </table>`;
    }
  } catch {
    document.getElementById('smodal-simulations').innerHTML = '<p style="color:var(--red);font-size:0.85rem;margin-top:16px">Error al cargar simulacros.</p>';
  }

  modal.classList.remove('hidden');
};

window.closeStudentModal = function() {
  document.getElementById('student-modal').classList.add('hidden');
};