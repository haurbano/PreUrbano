import { token, logout } from './shared.js';

let currentModalUser = null;

export async function loadUsers() {
  const wrap = document.getElementById('table-users');
  wrap.innerHTML = '<p style="color:var(--muted);padding:16px">Cargando...</p>';
  try {
    const res = await fetch('/users', { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    document.getElementById('stat-users-total').textContent  = data.length;
    document.getElementById('stat-users-active').textContent = data.filter(u => u.is_active).length;

    if (!data.length) {
      wrap.innerHTML = '<div class="empty-state">Aún no hay usuarios registrados.</div>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Usuario</th><th>Email</th><th>Estado</th><th>Registro</th></tr></thead>
        <tbody>${data.map((u, i) => `
          <tr class="clickable" onclick='openUserModal(${JSON.stringify(u)})'>
            <td style="color:var(--muted)">${i + 1}</td>
            <td>
              ${u.picture ? `<img class="user-avatar" src="${u.picture}" referrerpolicy="no-referrer" />` : ''}
              ${u.name}
            </td>
            <td style="color:var(--muted)">${u.email}</td>
            <td><span class="badge ${u.is_active ? 'badge-active' : 'badge-off'}">${u.is_active ? 'activo' : 'inactivo'}</span></td>
            <td style="color:var(--muted)">${new Date(u.created_at).toLocaleString('es-CO')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { wrap.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar datos.</p>'; }
}

export function openUserModal(u) {
  currentModalUser = u;
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
  const btn = document.getElementById('modal-toggle-btn');
  btn.textContent   = u.is_active ? 'Bloquear usuario' : 'Habilitar usuario';
  btn.style.background = u.is_active ? 'var(--red)' : 'var(--green)';
  document.getElementById('user-modal').classList.remove('hidden');
}

export async function toggleUser() {
  if (!currentModalUser) return;
  const action = currentModalUser.is_active ? 'bloquear' : 'habilitar';
  if (!confirm(`¿${action.charAt(0).toUpperCase() + action.slice(1)} a ${currentModalUser.name}?`)) return;
  const btn = document.getElementById('modal-toggle-btn');
  btn.disabled = true;
  btn.textContent = 'Guardando…';
  try {
    const res = await fetch(`/users/${currentModalUser.id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_active: !currentModalUser.is_active }),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('Error al actualizar.'); return; }
    const updated = await res.json();
    currentModalUser = updated;
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
