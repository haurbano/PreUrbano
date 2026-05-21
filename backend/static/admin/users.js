import { token, logout, showToast, SUBJECT_LABELS_SHORT, SUBJECT_COLORS } from './shared.js?v=5';

function fmtDuration(s) {
  if (s == null) return '—';
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

let currentModalUser = null;
let _currentPage = 1;
let _searchQ = '';
let _searchDebounceId = null;

function buildPagination(page, pages, total, pageSize) {
  if (pages <= 1) return '';
  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);
  let btns = `<button class="page-btn" onclick="loadUsers(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== pages) {
      if (p === 2 || p === pages - 1) btns += `<span class="page-info">…</span>`;
      continue;
    }
    btns += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="loadUsers(${p})">${p}</button>`;
  }
  btns += `<button class="page-btn" onclick="loadUsers(${page + 1})" ${page === pages ? 'disabled' : ''}>›</button>`;
  btns += `<span class="page-info">${start}–${end} de ${total}</span>`;
  return `<div class="pagination">${btns}</div>`;
}

export async function loadUsers(page = _currentPage) {
  _currentPage = page;
  const wrap = document.getElementById('table-users');
  wrap.textContent = '';
  const loading = document.createElement('p');
  loading.style.cssText = 'color:var(--muted);padding:16px';
  loading.textContent = 'Cargando...';
  wrap.appendChild(loading);

  const inp = document.getElementById('users-search');
  if (inp && inp.dataset.wired !== '1') {
    inp.value = _searchQ;
    inp.dataset.wired = '1';
    inp.addEventListener('input', e => {
      clearTimeout(_searchDebounceId);
      _searchDebounceId = setTimeout(() => {
        _searchQ = e.target.value.trim();
        _currentPage = 1;
        loadUsers(1);
      }, 300);
    });
  }

  try {
    const params = new URLSearchParams({ page: _currentPage });
    if (_searchQ) params.set('search', _searchQ);
    const [usersRes, studentsRes] = await Promise.all([
      fetch(`/admin/users?${params}`, { headers: { Authorization: `Bearer ${token()}` } }),
      fetch('/admin/students', { headers: { Authorization: `Bearer ${token()}` } }),
    ]);
    if (usersRes.status === 401 || studentsRes.status === 401) { logout(); return; }
    const users = await usersRes.json();
    const studentsData = await studentsRes.json();
    const studentsMap = {};
    for (const s of studentsData.items) studentsMap[s.user_id] = s;

    document.getElementById('stat-users-total').textContent  = users.total;
    document.getElementById('stat-users-active').textContent = users.total_active;

    if (!users.items.length) {
      const emptyMsg = _searchQ ? `Sin resultados para "${_searchQ}".` : 'Aún no hay usuarios registrados.';
      wrap.textContent = '';
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.textContent = emptyMsg;
      wrap.appendChild(empty);
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Sims</th><th>Promedio</th><th>Último</th><th>Estado</th><th>Pro</th><th>Registro</th></tr></thead>
        <tbody>${users.items.map((u, i) => {
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
            <td data-user-id="${u.id}" data-has-pro="${u.has_pro_access}" class="pro-toggle-cell"></td>
            <td style="color:var(--muted)">${new Date(u.created_at).toLocaleString('es-CO')}</td>
          </tr>`;
        }).join('')}
        </tbody>
      </table>`;
    _renderProToggles();
    const paginationHtml = buildPagination(users.page, users.pages, users.total, users.page_size);
    if (paginationHtml) {
      const paginationEl = document.createElement('div');
      paginationEl.innerHTML = paginationHtml;
      wrap.appendChild(paginationEl);
    }
  } catch {
    wrap.textContent = '';
    const err = document.createElement('p');
    err.style.cssText = 'color:var(--red);padding:16px';
    err.textContent = 'Error al cargar datos.';
    wrap.appendChild(err);
  }
}

function _renderProToggles() {
  document.querySelectorAll('.pro-toggle-cell').forEach(td => {
    const userId = parseInt(td.dataset.userId);
    const hasPro = td.dataset.hasPro === 'true';
    td.onclick = e => e.stopPropagation();
    const btn = document.createElement('button');
    btn.className = 'badge ' + (hasPro ? 'badge-pro' : 'badge-off');
    btn.style.cssText = 'cursor:pointer;border:none;font-family:inherit';
    btn.textContent = hasPro ? 'PRO ✓' : 'PRO —';
    btn.onclick = e => { e.stopPropagation(); toggleProAccess(userId, hasPro); };
    td.appendChild(btn);
  });
}

export async function toggleProAccess(userId, currentValue) {
  const newVal = !currentValue;
  try {
    const res = await fetch(`/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ has_pro_access: newVal }),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { showToast('Error al actualizar acceso Pro.'); return; }
    await loadUsers();
    showToast(newVal ? '✓ Acceso Pro habilitado' : '✓ Acceso Pro deshabilitado');
  } catch { showToast('Error de conexión.'); }
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
  document.getElementById('modal-phone').innerHTML        = u.phone || empty;
  document.getElementById('modal-institution').innerHTML  = u.institution || empty;
  document.getElementById('modal-grade').innerHTML        = u.grade || empty;
  document.getElementById('modal-status').innerHTML    = `<span class="badge ${u.is_active ? 'badge-active' : 'badge-off'}">${u.is_active ? 'activo' : 'inactivo'}</span>`;
  document.getElementById('modal-pro-status').innerHTML = `<span class="badge ${u.has_pro_access ? 'badge-pro' : 'badge-off'}">${u.has_pro_access ? 'habilitado' : 'deshabilitado'}</span>`;
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
  const proBtn = document.getElementById('modal-pro-btn');
  proBtn.textContent = u.has_pro_access ? 'Deshabilitar acceso Pro' : 'Habilitar acceso Pro';
  document.getElementById('user-modal').classList.remove('hidden');
}

window.openStudentSimulations = async function(userId, userName) {
  try {
    const res = await fetch(`/admin/students/${userId}/simulations`, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    if (!data.items.length) {
      showToast('No hay simulacros para este estudiante.');
      return;
    }

    const rows = data.items.map(sim => {
      const scoreClass = sim.score_pct >= 60 ? 'high' : 'low';
      const bdChips = Object.entries(sim.breakdown || {}).map(([subj, bd]) => {
        const color = SUBJECT_COLORS[subj] || '#999';
        return `<span class="bd-mini" style="background:${color}22;color:${color}">${SUBJECT_LABELS_SHORT[subj] || subj}: ${bd.correct}/${bd.total}</span>`;
      }).join('');
      return `<tr>
        <td style="color:var(--muted);white-space:nowrap">${new Date(sim.created_at).toLocaleDateString('es-CO')}</td>
        <td><span class="student-score ${scoreClass}" style="font-weight:700">${sim.score_pct}%</span></td>
        <td>${sim.correct_answers}/${sim.total_questions}</td>
        <td>${sim.timed_out ? '<span style="color:var(--red);font-size:0.78rem">⏱ Tiempo</span>' : '—'}</td>
        <td style="color:var(--muted);white-space:nowrap">${fmtDuration(sim.duration_seconds)}</td>
        <td><div class="sim-breakdown-cell">${bdChips}</div></td>
      </tr>`;
    }).join('');

    document.getElementById('sim-list-title').textContent = `Simulacros de ${userName}`;
    document.getElementById('sim-list-body').innerHTML = `
      <table class="sim-summary-table">
        <thead><tr><th>Fecha</th><th>Score</th><th>Correctas</th><th>Estado</th><th>Duración</th><th>Por materia</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
    document.getElementById('sim-list-modal').classList.remove('hidden');
  } catch { showToast('Error al cargar simulacros.'); }
};

export async function toggleUserPro() {
  if (!currentModalUser) return;
  const newVal = !currentModalUser.has_pro_access;
  const proBtn = document.getElementById('modal-pro-btn');
  proBtn.disabled = true;
  proBtn.textContent = 'Guardando…';
  try {
    const res = await fetch(`/admin/users/${currentModalUser.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ has_pro_access: newVal }),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { showToast('Error al actualizar.'); return; }
    const updated = await res.json();
    currentModalUser = { ...currentModalUser, ...updated, simData: currentModalUser.simData };
    document.getElementById('modal-pro-status').innerHTML = `<span class="badge ${updated.has_pro_access ? 'badge-pro' : 'badge-off'}">${updated.has_pro_access ? 'habilitado' : 'deshabilitado'}</span>`;
    proBtn.textContent = updated.has_pro_access ? 'Deshabilitar acceso Pro' : 'Habilitar acceso Pro';
    showToast(updated.has_pro_access ? '✓ Acceso Pro habilitado' : '✓ Acceso Pro deshabilitado');
    loadUsers();
  } catch { showToast('Error de conexión.'); }
  proBtn.disabled = false;
}

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
    if (!res.ok) { showToast('Error al actualizar.'); return; }
    const updated = await res.json();
    currentModalUser = { ...currentModalUser, ...updated, simData: currentModalUser.simData };
    document.getElementById('modal-status').innerHTML = `<span class="badge ${updated.is_active ? 'badge-active' : 'badge-off'}">${updated.is_active ? 'activo' : 'inactivo'}</span>`;
    btn.textContent      = updated.is_active ? 'Bloquear usuario' : 'Habilitar usuario';
    btn.style.background = updated.is_active ? 'var(--red)' : 'var(--green)';
    loadUsers();
  } catch { showToast('Error de conexión.'); }
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
    if (!res.ok) { showToast('Error al eliminar usuario.'); btn.disabled = false; btn.textContent = 'Eliminar usuario'; return; }

    document.getElementById('user-modal').classList.add('hidden');
    await loadUsers();
    showToast(`✓ ${name} eliminado`);
  } catch {
    showToast('Error de conexión.');
    btn.disabled = false;
    btn.textContent = 'Eliminar usuario';
  }
}
