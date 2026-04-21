import { token, logout, showToast } from './shared.js';

const SUBJECT_KEYS = ['matematicas', 'ciencias_naturales', 'lectura_critica', 'sociales', 'ingles'];

export async function loadSimConfig() {
  try {
    const res = await fetch('/admin/simulation/config', { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const cfg = await res.json();
    document.getElementById('sim-total').value = cfg.questions_per_simulation;
    SUBJECT_KEYS.forEach(s => {
      const el = document.getElementById('sim-' + s);
      if (el) el.value = cfg.subject_limits[s] || 0;
    });
  } catch { showToast('Error al cargar configuración'); }
}

export async function saveSimConfig() {
  const btn = document.getElementById('sim-save-btn');
  const msg = document.getElementById('sim-config-msg');
  msg.textContent = ''; msg.className = 'form-msg';
  btn.disabled = true; btn.textContent = 'Guardando…';
  const body = {
    questions_per_simulation: parseInt(document.getElementById('sim-total').value) || 20,
    subject_limits: Object.fromEntries(
      SUBJECT_KEYS.map(s => [s, parseInt(document.getElementById('sim-' + s).value) || 0])
    ),
  };
  try {
    const res = await fetch('/admin/simulation/config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) {
      const errText = await res.text();
      msg.textContent = 'Error al guardar: ' + errText;
      msg.className = 'form-msg err';
      btn.disabled = false; btn.textContent = 'Guardar configuración';
      return;
    }
    msg.textContent = 'Configuración guardada.';
    msg.className = 'form-msg ok';
  } catch (e) {
    msg.textContent = 'Error de conexión: ' + e.message;
    msg.className = 'form-msg err';
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar configuración';
  }
}
