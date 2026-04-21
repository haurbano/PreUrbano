import { token, logout } from './shared.js';

export async function loadSubscribers() {
  const wrap = document.getElementById('table-subscribers');
  wrap.innerHTML = '<p style="color:var(--muted);padding:16px">Cargando...</p>';
  try {
    const res = await fetch('/subscribers', { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();

    document.getElementById('stat-total').textContent = data.length;
    document.getElementById('stat-hero').textContent  = data.filter(s => s.source === 'hero').length;
    document.getElementById('stat-cta').textContent   = data.filter(s => s.source === 'cta').length;

    if (!data.length) {
      wrap.innerHTML = '<div class="empty-state">Aún no hay correos registrados.</div>';
      return;
    }
    wrap.innerHTML = `
      <table>
        <thead><tr><th>#</th><th>Email</th><th>Fuente</th><th>Fecha</th></tr></thead>
        <tbody>${data.map((s, i) => `
          <tr>
            <td style="color:var(--muted)">${i + 1}</td>
            <td>${s.email}</td>
            <td><span class="badge badge-${s.source}">${s.source}</span></td>
            <td style="color:var(--muted)">${new Date(s.created_at).toLocaleString('es-CO')}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch { wrap.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar datos.</p>'; }
}
