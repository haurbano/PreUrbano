import { TOKEN_KEY, token, logout, showToast } from './shared.js';
import { loadSubscribers } from './subscribers.js';
import { loadUsers, openUserModal, toggleUser, closeModal } from './users.js';
import {
  setFile, updateSaveBtn, handleDragOver, handleDragLeave, handleDrop,
  saveQuestion, loadQuestions, handleQuestionRowClick,
  saveQuestionEdit, deleteQuestion, deleteQuestionFromDetail,
} from './questions.js';
import { loadSimConfig, saveSimConfig } from './simconfig.js';

let currentView = 'subscribers';

async function login() {
  const pwd = document.getElementById('pwd').value;
  const err = document.getElementById('login-error');
  err.textContent = '';
  try {
    const res = await fetch('/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd }),
    });
    if (!res.ok) { err.textContent = 'Contraseña incorrecta'; return; }
    const { access_token } = await res.json();
    localStorage.setItem(TOKEN_KEY, access_token);
    showDashboard();
  } catch { err.textContent = 'Error de conexión'; }
}

function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').classList.add('visible');
  loadSubscribers();
}

export function switchView(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('view-' + view).classList.add('active');
  document.getElementById('nav-' + view).classList.add('active');
  currentView = view;
  if (view === 'subscribers') loadSubscribers();
  if (view === 'users')       loadUsers();
  if (view === 'banco')       loadQuestions();
  if (view === 'simconfig')   loadSimConfig();
}

export function backToQuestions() {
  switchView('banco');
}

// Wire file input and selects (module scripts run after DOM is ready)
document.getElementById('file-input').addEventListener('change', e => setFile(e.target.files[0]));
['new-subject', 'new-correct'].forEach(id =>
  document.getElementById(id).addEventListener('change', updateSaveBtn)
);

// Expose all functions that inline onclick= handlers call
Object.assign(window, {
  login,
  logout,
  switchView,
  backToQuestions,
  loadSubscribers,
  loadUsers,
  openUserModal,
  toggleUser,
  closeModal,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  saveQuestion,
  loadQuestions,
  handleQuestionRowClick,
  saveQuestionEdit,
  deleteQuestion,
  deleteQuestionFromDetail,
  loadSimConfig,
  saveSimConfig,
  showToast,
});

if (token()) showDashboard();
