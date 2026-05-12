import { TOKEN_KEY, token, logout, showToast } from './shared.js?v=5';
import { loadSubscribers } from './subscribers.js?v=5';
import { loadUsers, openUserModal, toggleUser, toggleUserPro, toggleProAccess, closeModal, deleteUser } from './users.js?v=8';
import {
  setFile, updateSaveBtn, handleDragOver, handleDragLeave, handleDrop,
  saveQuestion, loadQuestions, handleQuestionRowClick,
  saveQuestionEdit, deleteQuestion, deleteQuestionFromDetail,
  handleGroupSelectChange, saveGroupAssignment,
  setReplaceFile, handleReplaceDragOver, handleReplaceDragLeave, handleReplaceDrop,
  replaceQuestionImage, toggleDifficultySort,
} from './questions.js?v=9';
import { loadSimConfig, saveSimConfig } from './simconfig.js?v=3';
import { initAnalytics } from './analytics.js?v=1';
import {
  loadSimulacros, openSimulacroEditor, saveSimulacro,
  activateSimulacro, deactivateSimulacro, deleteSimulacro,
  addQuestionToSim, removeQuestionFromSim, moveQuestionInSim,
  openSimulacroResults,
  simChangeBancoSubject, simBancoPrevPage, simBancoNextPage,
} from './simulacros.js?v=3';

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
  if (view === 'simulacros')  loadSimulacros();
  if (view === 'analytics')   initAnalytics();
}

export function backToQuestions() {
  switchView('banco');
}

// Wire file input and selects (module scripts run after DOM is ready)
document.getElementById('file-input').addEventListener('change', e => setFile(e.target.files[0]));
['new-subject', 'new-correct'].forEach(id =>
  document.getElementById(id).addEventListener('change', updateSaveBtn)
);

function viewQuestionFromAnalytics(id) {
  document.getElementById('filter-id').value = id;
  switchView('banco');
}

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
  toggleUserPro,
  toggleProAccess,
  closeModal,
  deleteUser,
  handleDragOver,
  handleDragLeave,
  handleDrop,
  saveQuestion,
  loadQuestions,
  handleQuestionRowClick,
  saveQuestionEdit,
  deleteQuestion,
  deleteQuestionFromDetail,
  handleGroupSelectChange,
  saveGroupAssignment,
  setReplaceFile,
  handleReplaceDragOver,
  handleReplaceDragLeave,
  handleReplaceDrop,
  replaceQuestionImage,
  toggleDifficultySort,
  loadSimConfig,
  saveSimConfig,
  showToast,
  loadSimulacros,
  openSimulacroEditor,
  saveSimulacro,
  activateSimulacro,
  deactivateSimulacro,
  deleteSimulacro,
  addQuestionToSim,
  removeQuestionFromSim,
  moveQuestionInSim,
  openSimulacroResults,
  simChangeBancoSubject,
  simBancoPrevPage,
  simBancoNextPage,
  viewQuestionFromAnalytics,
});

if (token()) showDashboard();
