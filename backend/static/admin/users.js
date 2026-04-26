import { token, logout, showToast } from './shared.js';

let currentModalUser = null;

export async function loadUsers() {
  const wrap = document.getElementById('table-users');
  wrap.innerHTML = '<p style="color:var(--muted);padding:16px">Cargando...</p>';
  try {
    const [usersRes, studentsRes] = await Promise.all([
      fetch('/admin/users', { headers: { Authorization: `Bearer ${token()}` } }),
      fetch('/admin/students', { headers: { Authorization: `Bearer ${token()}` } }),
    ]);
    if (usersRes.status === 401 || studentsRes.status === 401) { logout(); return; }
    const users = await usersRes.json();
    const studentsData = await studentsRes.json();
    const studentsMap = {};
    for (const s of studentsData.items) studentsMap[s.user_id] = s;

    document.getElementById('stat-users-total').textContent  = users.length;
    document.getElementById('stat-users-active').textContent = users.filter(u => u.is_active).length;

    if (!users.length) {
      wrap.innerHTML = '<div class="empty-state">Aún no hay usuarios registrados.</div>';
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Sims</th><th>Promedio</th><th>Último</th><th>Estado</th><th>Registro</th></tr></thead>
        <tbody>${users.map((u, i) => {
          const s = studentsMap[u.id] || {};
          const scoreClass = s.avg_score >= 60 ? 'high' : 'low';
          const lastDate = s.last_sim_date
            ? new Date(s.last_sim_date).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' })
            : '—';
          return `<tr class="clickable" onclick='openUserModal(${JSON.stringify(u)}, ${JSON.stringify(s)})'>
            <td style="color:var(--muted)">${i + 1}</td>
            <td>
              ${u.picture ? `<img class="user-avatar" src="${u.picture}" referrerpolicy="no-referrer" />` : ''}
              ${u.name}
            </td>
            <td style="color:var(--muted)">${u.email}</td>
            <td style="text-align:center;color:var(--muted)">${s.total_simulations || 0}</td>
            <td style="text-align:center"><span class="student-score ${scoreClass}">${s.avg_score || 0}%</span></td>
            <td style="color:var(--muted)">${lastDate}</td>
            <td><span class="badge ${u.is_active ? 'badge-active' : 'badge-off'}">${u.is_active ? 'activo' : 'inactivo'}</span></td>
            <td style="color:var(--muted)">${new Date(u.created_at).toLocaleString('es-CO')}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;
  } catch { wrap.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar datos.</p>'; }
}

export function openUserModal(u, simData = {}) {
  currentModalUser = { ...u, simData };
  const empty = '<span class="val-empty">Sin completar</span>';
  document.getElementById('modal-avatar').innerHTML = u.picture
    ? `<img class="modal-avatar" src="${u.picture}" referrerpolicy="no-referrer" />`
    : `<div class="modal-avatar-placeholder">👤</div>`;
  document.getElementById('modal-name').textContent    = u.name;
  document.getElementById('modal-email').textContent   = u.email;
  document.getElementById('modal-document').innerHTML  = u.document_id || empty;
  document.getElementById('modal-phone').innerHTML     = u.phone || empty;
  document.getElementById('modal-status').innerHTML    = `<span class="badge ${u.is_active ? 'badge-active' : 'badge-off'}">${u.is_active ? 'activo' : 'inactivo'}</span>`;
  document.getElementById('modal-created').textContent = new Date(u.created_at).toLocaleString('es-CO');

  const simSection = document.getElementById('modal-sim-section');
  if (simData && simData.total_simulations > 0) {
    const scoreClass = simData.avg_score >= 60 ? 'high' : 'low';
    simSection.style.display = 'block';
    simSection.innerHTML = `
      <div class="modal-section-title">Simulacros (últimos 10)</div>
      <div class="modal-fields" style="gap:8px">
        <div class="modal-field"><span class="lbl">Simulacros</span><span class="val">${simData.total_simulations}</span></div>
        <div class="modal-field"><span class="lbl">Promedio</span><span class="val student-score ${scoreClass}">${simData.avg_score}%</span></div>
        <div class="modal-field"><span class="lbl">Correctas</span><span class="val">${simData.total_correct}/${simData.total_questions}</span></div>
        <div class="modal-field"><span class="lbl">Último</span><span class="val">${new Date(simData.last_sim_date).toLocaleDateString('es-CO')}</span></div>
      </div>
      <button class="btn" style="margin-top:16px;width:100%;background:rgba(108,99,255,0.15);color:var(--accent);border:1px solid rgba(108,99,255,0.3)" onclick="openStudentSimulations(${u.id}, '${u.name}')">Ver últimos simulacros →</button>`;
  } else {
    simSection.style.display = 'none';
  }

  const btn = document.getElementById('modal-toggle-btn');
  btn.textContent   = u.is_active ? 'Bloquear usuario' : 'Habilitar usuario';
  btn.style.background = u.is_active ? 'var(--red)' : 'var(--green)';
  document.getElementById('user-modal').classList.remove('hidden');
}

window.openStudentSimulations = async function(userId, userName) {
  try {
    const res = await fetch(`/admin/students/${userId}/simulations`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    if (!data.items.length) {
      alert('No hay simulacros para este estudiante.');
      return;
    }

    const rows = data.items.map(sim => {
      const scoreClass = sim.score_pct >= 60 ? 'high' : 'low';
      const bdChips = Object.entries(sim.breakdown || {}).map(([subj, bd]) => {
        const colors = { matematicas: '#a59dff', ciencias_naturales: '#34d399', lectura_critica: '#7dd3fc', sociales: '#fbbf24', ingles: '#f87171' };
        const labels = { matematicas: 'Mate', ciencias_naturales: 'Ciencias', lectura_critica: 'Lectura', sociales: 'Sociales', ingles: 'Inglés' };
        return `<span class="bd-mini" style="background:${colors[subj]}22;color:${colors[subj]}">${labels[subj]}: ${bd.correct}/${bd.total}</span>`;
      }).join('');
      return `<tr>
        <td style="color:var(--muted);white-space:nowrap">${new Date(sim.created_at).toLocaleDateString('es-CO')}</td>
        <td><span class="student-score ${scoreClass}" style="font-weight:700">${sim.score_pct}%</span></td>
        <td>${sim.correct_answers}/${sim.total_questions}</td>
        <td>${sim.timed_out ? '<span style="color:var(--red);font-size:0.78rem">⏱ Tiempo</span>' : '—'}</td>
        <td><div class="sim-breakdown-cell">${bdChips}</div></td>
      </tr>`;
    }).join('');

    document.getElementById('sim-list-title').textContent = `Simulacros de ${userName}`;
    document.getElementById('sim-list-body').innerHTML = `
      <table class="sim-summary-table">
        <thead><tr><th>Fecha</th><th>Score</th><th>Correctas</th><th>Estado</th><th>Por materia</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    document.getElementById('sim-list-modal').classList.remove('hidden');
  } catch { alert('Error al cargar simulacros.'); }
};

export async function toggleUser() {
  if (!currentModalUser) return;
  const action = currentModalUser.is_active ? 'bloquear' : 'habilitar';
  if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${currentModalUser.name}?`)) return;
  const btn = document.getElementById('modal-toggle-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const res = await fetch(`/admin/users/${currentModalUser.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentModalUser.is_active }),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('Error al actualizar.'); return; }
    const updated = await res.json();
    currentModalUser = { ...currentModalUser, ...updated, simData: currentModalUser.simData };
    document.getElementById('modal-status').innerHTML = `<span class="badge ${updated.is_active ? 'badge-active' : 'badge-off'}">${updated.is_active ? 'activo' : 'inactivo'}</span>`;
    btn.textContent      = updated.is_active ? 'Bloquear usuario' : 'Habilitar usuario';
    btn.style.background = updated.is_active ? 'var(--red)' : 'var(--green)';
    loadUsers();
  } catch { alert('Error de conexión.'); }
  btn.disabled = false;
}

export function closeModal(e) {
  if (e.target === document.getElementById('user-modal'))
    document.getElementById('user-modal').classList.add('hidden');
}

export async function deleteUser() {
  if (!currentModalUser) return;
  const name = currentModalUser.name;
  if (!confirm(`¿Eliminar a ${name}?\n\nEl usuario no podrá volver a iniciar sesión y desaparecerá del panel. Sus datos históricos se conservan.`)) return;

  const btn = document.getElementById('modal-delete-btn');
  btn.disabled = true;
  btn.textContent = 'Eliminando…';

  try {
    const res = await fetch(`/admin/users/${currentModalUser.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('Error al eliminar usuario.'); btn.disabled = false; btn.textContent = 'Eliminar usuario'; return; }

    document.getElementById('user-modal').classList.add('hidden');
    await loadUsers();
    showToast(`✓ ${name} eliminado`);
  } catch {
    alert('Error de conexión.');
    btn.disabled = false;
    btn.textContent = 'Eliminar usuario';
  }
}
