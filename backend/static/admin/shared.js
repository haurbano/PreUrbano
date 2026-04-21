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
