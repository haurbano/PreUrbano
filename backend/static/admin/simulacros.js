import { token, showToast, SUBJECT_LABELS } from './shared.js?v=4';

let _simEditor = null;
let _simBancoPg = 1;
let _simBancoSubject = '';

function _esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export async function loadSimulacros() {
  const v = document.getElementById('view-simulacros');
  v.innerHTML = '<div style="padding:20px;color:var(--muted)">Cargando…</div>';
  try {
    const res = await fetch('/simulacros', { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) throw new Error();
    _renderSimList(await res.json());
  } catch {
    v.innerHTML = '<div style="padding:20px;color:var(--red)">Error al cargar simulacros.</div>';
  }
}

function _renderSimList(sims) {
  const rows = sims.length === 0
    ? `<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted)">Sin simulacros aún. Crea el primero.</td></tr>`
    : sims.map(s => {
        const badge = s.is_active
          ? `<span class="status-badge active">Activo</span>`
          : `<span class="status-badge inactive">Inactivo</span>`;
        const toggleBtn = s.is_active
          ? `<button class="action-btn" onclick="event.stopPropagation();deactivateSimulacro(${s.id})">Desactivar</button>`
          : `<button class="action-btn" style="border-color:rgba(52,211,153,0.4);color:#34d399" onclick="event.stopPropagation();activateSimulacro(${s.id})">Activar</button>`;
        return `<tr class="clickable" onclick="openSimulacroEditor(${s.id})">
          <td style="font-weight:600">${_esc(s.name)}</td>
          <td>${s.question_count}</td>
          <td>${s.attempts_count}</td>
          <td>${badge}</td>
          <td style="white-space:nowrap">
            ${toggleBtn}
            <button class="action-btn" onclick="event.stopPropagation();openSimulacroResults(${s.id})">Resultados</button>
            ${!s.is_active ? `<button class="action-btn del" onclick="event.stopPropagation();deleteSimulacro(${s.id})">Eliminar</button>` : ''}
          </td>
        </tr>`;
      }).join('');

  document.getElementById('view-simulacros').innerHTML = `
    <div class="section-header" style="margin-bottom:20px">
      <h2>Simulacros</h2>
      <button class="refresh-btn" onclick="openSimulacroEditor(null)">+ Nuevo simulacro</button>
    </div>
    <table>
      <thead><tr>
        <th>Nombre</th><th>Preguntas</th><th>Intentos</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

export async function openSimulacroEditor(id) {
  const v = document.getElementById('view-simulacros');
  v.innerHTML = '<div style="padding:20px;color:var(--muted)">Cargando…</div>';

  if (id) {
    try {
      const res = await fetch(`/simulacros/${id}`, { headers: { Authorization: `Bearer ${token()}` } });
      if (!res.ok) throw new Error();
      const detail = await res.json();
      _simEditor = {
        id: detail.id,
        name: detail.name,
        timeLimitMinutes: detail.time_limit_minutes,
        isActive: detail.is_active,
        questions: detail.questions.map(q => ({ id: q.id, subject: q.subject, image_path: q.image_path })),
      };
    } catch {
      v.innerHTML = '<div style="padding:20px;color:var(--red)">Error al cargar simulacro.</div>';
      return;
    }
  } else {
    _simEditor = { id: null, name: '', timeLimitMinutes: 0, isActive: false, questions: [] };
  }

  _simBancoPg = 1;
  _simBancoSubject = '';
  _renderSimEditor();
}

function _renderSimEditor() {
  const v = document.getElementById('view-simulacros');
  const isNew = _simEditor.id === null;

  const actionBtns = isNew ? '' : `
    ${_simEditor.isActive
      ? `<button class="action-btn" onclick="deactivateSimulacro(${_simEditor.id})">Desactivar</button>`
      : `<button class="action-btn" style="border-color:rgba(52,211,153,0.4);color:#34d399" onclick="activateSimulacro(${_simEditor.id})">Activar</button>`}
    ${!_simEditor.isActive ? `<button class="action-btn del" onclick="deleteSimulacro(${_simEditor.id})">Eliminar</button>` : ''}`;

  v.innerHTML = `
    <button class="detail-back" onclick="loadSimulacros()">← Volver a simulacros</button>
    <div class="sim-editor">
      <div class="sim-editor-header">
        <div class="sim-editor-fields">
          <div>
            <label class="sim-editor-lbl">Nombre del simulacro</label>
            <input type="text" id="sim-editor-name" class="sim-editor-input"
              value="${_esc(_simEditor.name)}" placeholder="Ej. Simulacro Semana 1" maxlength="150" />
          </div>
          <div>
            <label class="sim-editor-lbl">Tiempo límite (min · 0 = sin límite)</label>
            <input type="number" id="sim-editor-time" class="sim-editor-input"
              value="${_simEditor.timeLimitMinutes}" min="0" max="180" style="width:88px" />
          </div>
        </div>
      </div>
      <div class="sim-editor-cols">
        <div class="sim-editor-banco">
          <div class="sim-editor-col-title">Banco de preguntas</div>
          <div class="filter-row" style="margin-bottom:12px">
            <select id="sim-banco-subject" onchange="simChangeBancoSubject()">
              <option value="">Todas las materias</option>
              <option value="matematicas">Matemáticas</option>
              <option value="ciencias_naturales">Ciencias Naturales</option>
              <option value="lectura_critica">Lectura Crítica</option>
              <option value="sociales">Sociales</option>
              <option value="ingles">Inglés</option>
            </select>
          </div>
          <div id="sim-banco-list">Cargando…</div>
        </div>
        <div class="sim-editor-selected">
          <div class="sim-editor-col-title">Preguntas seleccionadas (<span id="sim-sel-count">${_simEditor.questions.length}</span>)</div>
          <div id="sim-sel-list"></div>
        </div>
      </div>
      <div class="sim-editor-actions">
        <button class="btn" style="max-width:180px" onclick="saveSimulacro()">
          ${isNew ? 'Crear simulacro' : 'Guardar cambios'}
        </button>
        ${actionBtns}
      </div>
      <div id="sim-editor-msg" style="font-size:0.82rem;margin-top:10px;min-height:18px"></div>
    </div>`;

  _renderSelectedQuestions();
  _loadBancoPage();
}

async function _loadBancoPage() {
  const container = document.getElementById('sim-banco-list');
  if (!container) return;
  container.innerHTML = '<div style="padding:8px;color:var(--muted);font-size:0.85rem">Cargando…</div>';
  try {
    const params = new URLSearchParams({ page: _simBancoPg });
    if (_simBancoSubject) params.set('subject', _simBancoSubject);
    const res = await fetch(`/questions?${params}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    _renderBancoList(data.items, data.pages);
  } catch {
    container.innerHTML = '<div style="padding:8px;color:var(--red);font-size:0.85rem">Error al cargar preguntas.</div>';
  }
}

function _renderBancoList(items, pages) {
  const container = document.getElementById('sim-banco-list');
  if (!container) return;
  const selectedIds = new Set(_simEditor.questions.map(q => q.id));

  const rows = items.length === 0
    ? '<div style="padding:8px;color:var(--muted);font-size:0.85rem">Sin preguntas en este filtro.</div>'
    : items.map(q => {
        const inSim = selectedIds.has(q.id);
        const badgeCls = `badge-${q.subject}`;
        return `<div class="banco-item${inSim ? ' in-sim' : ''}">
          <span class="badge ${badgeCls}" style="font-size:0.68rem;padding:2px 7px;border-radius:6px;font-weight:600;flex-shrink:0">${SUBJECT_LABELS[q.subject] || q.subject}</span>
          <span style="font-size:0.82rem;color:var(--muted);flex:1">ID #${q.id}</span>
          ${inSim
            ? `<span style="font-size:0.72rem;color:var(--muted)">ya añadida</span>`
            : `<button class="action-btn" style="padding:3px 10px;font-size:0.78rem;flex-shrink:0" onclick="addQuestionToSim(${q.id},'${_esc(q.subject)}','${_esc(q.image_path)}')">+</button>`}
        </div>`;
      }).join('');

  const pagination = pages > 1 ? `
    <div class="pagination" style="margin-top:8px">
      <button class="page-btn" ${_simBancoPg === 1 ? 'disabled' : ''} onclick="simBancoPrevPage()">‹</button>
      <span class="page-info">${_simBancoPg} / ${pages}</span>
      <button class="page-btn" ${_simBancoPg >= pages ? 'disabled' : ''} onclick="simBancoNextPage()">›</button>
    </div>` : '';

  container.innerHTML = rows + pagination;
}

function _renderSelectedQuestions() {
  const container = document.getElementById('sim-sel-list');
  const countEl = document.getElementById('sim-sel-count');
  if (!container) return;
  if (countEl) countEl.textContent = _simEditor.questions.length;

  if (_simEditor.questions.length === 0) {
    container.innerHTML = '<div style="padding:12px 0;color:var(--muted);font-size:0.85rem">Agrega preguntas desde el banco.</div>';
    return;
  }

  container.innerHTML = _simEditor.questions.map((q, i) => {
    const badgeCls = `badge-${q.subject}`;
    return `<div class="sim-sel-item">
      <span class="sim-sel-num">${i + 1}</span>
      <span class="badge ${badgeCls}" style="font-size:0.68rem;padding:2px 7px;border-radius:6px;font-weight:600;flex-shrink:0">${SUBJECT_LABELS[q.subject] || q.subject}</span>
      <span style="font-size:0.82rem;color:var(--muted);flex:1">ID #${q.id}</span>
      <div style="display:flex;gap:3px;flex-shrink:0">
        <button class="action-btn" style="padding:2px 7px" ${i === 0 ? 'disabled' : ''} onclick="moveQuestionInSim(${i},-1)">↑</button>
        <button class="action-btn" style="padding:2px 7px" ${i === _simEditor.questions.length - 1 ? 'disabled' : ''} onclick="moveQuestionInSim(${i},1)">↓</button>
        <button class="action-btn del" style="padding:2px 7px" onclick="removeQuestionFromSim(${i})">×</button>
      </div>
    </div>`;
  }).join('');
}

export function simChangeBancoSubject() {
  const el = document.getElementById('sim-banco-subject');
  if (!el) return;
  _simBancoSubject = el.value;
  _simBancoPg = 1;
  _loadBancoPage();
}

export function simBancoPrevPage() {
  if (_simBancoPg > 1) { _simBancoPg--; _loadBancoPage(); }
}

export function simBancoNextPage() {
  _simBancoPg++;
  _loadBancoPage();
}

export function addQuestionToSim(qId, subject, imagePath) {
  if (_simEditor.questions.some(q => q.id === qId)) return;
  _simEditor.questions.push({ id: qId, subject, image_path: imagePath });
  _renderSelectedQuestions();
  _loadBancoPage();
}

export function removeQuestionFromSim(idx) {
  _simEditor.questions.splice(idx, 1);
  _renderSelectedQuestions();
  _loadBancoPage();
}

export function moveQuestionInSim(idx, dir) {
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= _simEditor.questions.length) return;
  [_simEditor.questions[idx], _simEditor.questions[newIdx]] = [_simEditor.questions[newIdx], _simEditor.questions[idx]];
  _renderSelectedQuestions();
}

export async function saveSimulacro() {
  const msg = document.getElementById('sim-editor-msg');
  const name = document.getElementById('sim-editor-name').value.trim();
  const timeLimitMinutes = parseInt(document.getElementById('sim-editor-time').value, 10) || 0;

  if (!name) { msg.textContent = 'El nombre es obligatorio.'; msg.style.color = 'var(--red)'; return; }
  if (_simEditor.questions.length === 0) { msg.textContent = 'Agrega al menos una pregunta.'; msg.style.color = 'var(--red)'; return; }

  msg.textContent = 'Guardando…'; msg.style.color = 'var(--muted)';
  const body = { name, time_limit_minutes: timeLimitMinutes, question_ids: _simEditor.questions.map(q => q.id) };
  try {
    const isNew = _simEditor.id === null;
    const url = isNew ? '/simulacros' : `/simulacros/${_simEditor.id}`;
    const res = await fetch(url, {
      method: isNew ? 'POST' : 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      msg.textContent = data.detail || 'Error al guardar.';
      msg.style.color = 'var(--red)';
      return;
    }
    const saved = await res.json();
    _simEditor.id = saved.id;
    _simEditor.isActive = saved.is_active;
    _simEditor.name = saved.name;
    _simEditor.timeLimitMinutes = saved.time_limit_minutes;
    msg.textContent = isNew ? 'Simulacro creado.' : 'Cambios guardados.';
    msg.style.color = 'var(--green)';
    // Re-render to show activate/delete buttons now that we have an id
    if (isNew) _renderSimEditor();
  } catch {
    msg.textContent = 'Error de conexión.'; msg.style.color = 'var(--red)';
  }
}

export async function activateSimulacro(id) {
  try {
    const res = await fetch(`/simulacros/${id}/activate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) throw new Error();
    showToast('Simulacro activado.');
    if (_simEditor && _simEditor.id === id) {
      _simEditor.isActive = true;
      _renderSimEditor();
    } else {
      loadSimulacros();
    }
  } catch { showToast('Error al activar.'); }
}

export async function deactivateSimulacro(id) {
  try {
    const res = await fetch(`/simulacros/${id}/deactivate`, {
      method: 'POST', headers: { Authorization: `Bearer ${token()}` },
    });
    if (!res.ok) throw new Error();
    showToast('Simulacro desactivado.');
    if (_simEditor && _simEditor.id === id) {
      _simEditor.isActive = false;
      _renderSimEditor();
    } else {
      loadSimulacros();
    }
  } catch { showToast('Error al desactivar.'); }
}

export async function deleteSimulacro(id) {
  if (!confirm('¿Eliminar este simulacro? Esta acción no se puede deshacer.')) return;
  try {
    const res = await fetch(`/simulacros/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 409) { showToast('Desactiva el simulacro antes de eliminarlo.'); return; }
    if (!res.ok) throw new Error();
    showToast('Simulacro eliminado.');
    loadSimulacros();
  } catch { showToast('Error al eliminar.'); }
}

export async function openSimulacroResults(id) {
  const modal = document.getElementById('sim-list-modal');
  const body = document.getElementById('sim-list-body');
  const title = document.getElementById('sim-list-title');
  title.textContent = 'Cargando resultados…';
  body.innerHTML = '';
  modal.classList.remove('hidden');
  try {
    const res = await fetch(`/simulacros/${id}/results`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) throw new Error();
    const data = await res.json();
    title.textContent = `Resultados (${data.total})`;
    if (data.items.length === 0) {
      body.innerHTML = '<div style="padding:16px;color:var(--muted);text-align:center">Sin intentos aún.</div>';
      return;
    }
    const rows = data.items.map(r => {
      const date = new Date(r.created_at).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
      const scoreColor = r.score >= 60 ? 'var(--green)' : 'var(--red)';
      return `<tr>
        <td>${_esc(r.user_name)}</td>
        <td style="color:var(--muted);font-size:0.82rem">${_esc(r.user_email)}</td>
        <td style="font-weight:700;color:${scoreColor}">${r.score}%</td>
        <td>${r.correct_answers}/${r.total_questions}</td>
        <td style="color:var(--muted);font-size:0.82rem">${date}</td>
        <td style="color:var(--red);font-size:0.78rem">${r.timed_out ? '⏱ tiempo' : ''}</td>
      </tr>`;
    }).join('');
    body.innerHTML = `<table class="sim-summary-table">
      <thead><tr><th>Estudiante</th><th>Email</th><th>Score</th><th>Correctas</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  } catch {
    body.innerHTML = '<div style="padding:16px;color:var(--red)">Error al cargar resultados.</div>';
  }
}
