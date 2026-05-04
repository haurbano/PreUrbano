export const TOKEN_KEY = 'pu_admin_token';

export function token() {
  return localStorage.getItem(TOKEN_KEY);
}

export const SUBJECT_LABELS = {
  matematicas: 'Matemáticas',
  ciencias_naturales: 'Ciencias Naturales',
  lectura_critica: 'Lectura Crítica',
  sociales: 'Sociales',
  ingles: 'Inglés',
};

export const SUBJECT_LABELS_SHORT = {
  matematicas: 'Mate',
  ciencias_naturales: 'Ciencias',
  lectura_critica: 'Lectura',
  sociales: 'Sociales',
  ingles: 'Inglés',
};

export const SUBJECT_COLORS = {
  matematicas: '#a59dff',
  ciencias_naturales: '#34d399',
  lectura_critica: '#7dd3fc',
  sociales: '#fbbf24',
  ingles: '#f87171',
};

// admin.preurbano.com no enruta /uploads/ correctamente por el tunnel de Cloudflare
export function uploadUrl(path) {
  const base = location.hostname === 'admin.preurbano.com' ? 'https://preurbano.com' : '';
  return `${base}/uploads/${path}`;
}

export function subjectLabel(s) {
  return SUBJECT_LABELS[s] || s;
}

let _toastTimer = null;
export function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  document.getElementById('dashboard').classList.remove('visible');
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('pwd').value = '';
}
