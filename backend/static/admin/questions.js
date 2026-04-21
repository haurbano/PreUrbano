import { token, logout, showToast, subjectLabel } from './shared.js';

export let selectedFile = null;
let _currentPage = 1;
const _questionsCache = {};
let _detailQuestion = null;

export function updateSaveBtn() {
  const ready = selectedFile &&
    document.getElementById('new-subject').value &&
    document.getElementById('new-correct').value;
  document.getElementById('save-btn').disabled = !ready;
}

export function setFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { alert('La imagen supera el límite de 20 MB.'); return; }
  selectedFile = file;
  document.getElementById('drop-zone-filename').textContent = file.name;
  document.getElementById('drop-zone').classList.add('has-file');
  updateSaveBtn();
}

export function handleDragOver(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.add('drag-over');
}

export function handleDragLeave() {
  document.getElementById('drop-zone').classList.remove('drag-over');
}

export function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('drag-over');
  if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
}

export async function saveQuestion() {
  if (!selectedFile) return;
  const subject = document.getElementById('new-subject').value;
  const correct = document.getElementById('new-correct').value;
  if (!subject || !correct) return;

  const btn = document.getElementById('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Guardando…';

  try {
    const fd = new FormData();
    fd.append('file', selectedFile);
    fd.append('subject', subject);
    fd.append('correct_option', correct);
    const res = await fetch('/questions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token()}` },
      body: fd,
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('Error: ' + (await res.text())); }
    else {
      selectedFile = null;
      document.getElementById('drop-zone-filename').textContent = '';
      document.getElementById('drop-zone').classList.remove('has-file');
      document.getElementById('file-input').value = '';
      document.getElementById('new-subject').value = '';
      document.getElementById('new-correct').value = '';
      updateSaveBtn();
      await loadQuestions(1);
      document.getElementById('table-questions').scrollIntoView({ behavior: 'smooth', block: 'start' });
      showToast('✓ Pregunta guardada');
    }
  } catch { alert('Error de conexión.'); }

  btn.disabled = false;
  btn.textContent = 'Guardar';
}

export async function loadQuestions(page) {
  if (page !== undefined) _currentPage = page;
  const wrap = document.getElementById('table-questions');
  if (!wrap) return;
  wrap.innerHTML = '<p style="color:var(--muted);padding:16px">Cargando…</p>';
  const subject = document.getElementById('filter-subject')?.value || '';
  const params = new URLSearchParams({ page: _currentPage });
  if (subject) params.set('subject', subject);
  try {
    const res = await fetch('/questions?' + params, { headers: { Authorization: `Bearer ${token()}` } });
    if (res.status === 401) { logout(); return; }
    const data = await res.json();
    if (!data.total) {
      wrap.innerHTML = '<div class="empty-state">No hay preguntas aún.</div>';
      return;
    }
    data.items.forEach(q => { _questionsCache[q.id] = q; });
    const rows = data.items.map(q => `
      <tr class="clickable" onclick="handleQuestionRowClick(${q.id})">
        <td><img class="q-thumb" src="https://preurbano.com/uploads/${q.image_path}" /></td>
        <td><span class="badge badge-${q.subject}">${subjectLabel(q.subject)}</span></td>
        <td><span class="badge badge-option">${q.correct_option}</span></td>
        <td style="color:var(--muted)">${new Date(q.created_at).toLocaleDateString('es-CO')}</td>
        <td onclick="event.stopPropagation()">
          <button class="action-btn del" onclick="deleteQuestion(${q.id})">🗑</button>
        </td>
      </tr>`).join('');

    const paginationHtml = buildPagination(data.page, data.pages, data.total, data.page_size);

    wrap.innerHTML = `
      <table>
        <thead><tr><th></th><th>Materia</th><th>Respuesta</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      ${paginationHtml}`;
  } catch { wrap.innerHTML = '<p style="color:var(--red);padding:16px">Error al cargar preguntas.</p>'; }
}

function buildPagination(page, pages, total, pageSize) {
  if (pages <= 1) return '';
  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);
  let btns = `<button class="page-btn" onclick="loadQuestions(${page - 1})" ${page === 1 ? 'disabled' : ''}>‹</button>`;
  for (let p = 1; p <= pages; p++) {
    if (pages > 7 && Math.abs(p - page) > 2 && p !== 1 && p !== pages) {
      if (p === 2 || p === pages - 1) btns += `<span class="page-info">…</span>`;
      continue;
    }
    btns += `<button class="page-btn ${p === page ? 'active' : ''}" onclick="loadQuestions(${p})">${p}</button>`;
  }
  btns += `<button class="page-btn" onclick="loadQuestions(${page + 1})" ${page === pages ? 'disabled' : ''}>›</button>`;
  btns += `<span class="page-info">${start}–${end} de ${total}</span>`;
  return `<div class="pagination">${btns}</div>`;
}

export function handleQuestionRowClick(id) {
  const q = _questionsCache[id];
  if (q) openQuestionDetail(q);
}

export function openQuestionDetail(q) {
  _detailQuestion = q;

  document.getElementById('detail-meta').innerHTML =
    `<span class="badge badge-${q.subject}">${subjectLabel(q.subject)}</span>` +
    `<span class="badge badge-option">Respuesta correcta: ${q.correct_option}</span>`;

  document.getElementById('detail-image').src = `https://preurbano.com/uploads/${q.image_path}`;

  document.getElementById('detail-actions').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
        <div>
          <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Materia</div>
          <select id="edit-subject" class="edit-select">
            <option value="matematicas"        ${q.subject==='matematicas'        ?'selected':''}>Matemáticas</option>
            <option value="ciencias_naturales" ${q.subject==='ciencias_naturales' ?'selected':''}>Ciencias Naturales</option>
            <option value="lectura_critica"    ${q.subject==='lectura_critica'    ?'selected':''}>Lectura Crítica</option>
            <option value="sociales"           ${q.subject==='sociales'           ?'selected':''}>Sociales</option>
            <option value="ingles"             ${q.subject==='ingles'             ?'selected':''}>Inglés</option>
          </select>
        </div>
        <div>
          <div style="font-size:0.72rem;color:var(--muted);margin-bottom:6px;text-transform:uppercase;letter-spacing:.06em">Respuesta correcta</div>
          <select id="edit-correct" class="edit-select">
            <option ${q.correct_option==='A'?'selected':''}>A</option>
            <option ${q.correct_option==='B'?'selected':''}>B</option>
            <option ${q.correct_option==='C'?'selected':''}>C</option>
            <option ${q.correct_option==='D'?'selected':''}>D</option>
          </select>
        </div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="detail-btn approve" onclick="saveQuestionEdit(${q.id})">Guardar cambios</button>
        <button class="detail-btn del" onclick="deleteQuestionFromDetail(${q.id})">🗑 Eliminar</button>
      </div>
    </div>`;

  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-question-detail').classList.add('active');
  document.getElementById('nav-banco').classList.add('active');
}

export async function saveQuestionEdit(id) {
  const subject        = document.getElementById('edit-subject').value;
  const correct_option = document.getElementById('edit-correct').value;
  try {
    const res = await fetch(`/questions/${id}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, correct_option }),
    });
    if (res.status === 401) { logout(); return; }
    if (!res.ok) { alert('Error al guardar.'); return; }
    const updated = await res.json();
    _detailQuestion = updated;
    document.getElementById('detail-meta').innerHTML =
      `<span class="badge badge-${updated.subject}">${subjectLabel(updated.subject)}</span>` +
      `<span class="badge badge-option">Respuesta correcta: ${updated.correct_option}</span>`;
    showToast('✓ Cambios guardados');
  } catch { alert('Error de conexión.'); }
}

export async function deleteQuestion(id) {
  if (!confirm('¿Eliminar esta pregunta?')) return;
  try {
    const res = await fetch(`/questions/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) { logout(); return; }
    await loadQuestions();
  } catch { alert('Error al eliminar pregunta.'); }
}

export async function deleteQuestionFromDetail(id) {
  if (!confirm('¿Eliminar esta pregunta?')) return;
  try {
    const res = await fetch(`/questions/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token()}` },
    });
    if (res.status === 401) { logout(); return; }
    window.backToQuestions();
  } catch { alert('Error al eliminar pregunta.'); }
}
