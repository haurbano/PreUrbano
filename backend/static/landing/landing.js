// Countdown to launch date
const launchDate = new Date('2026-04-27T00:00:00');

function updateCountdown() {
  const daysEl    = document.getElementById('days');
  const hoursEl   = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');
  if (!daysEl) return;

  const now = new Date();
  const diff = launchDate - now;
  if (diff <= 0) {
    daysEl.textContent = hoursEl.textContent = minutesEl.textContent = secondsEl.textContent = '00';
    return;
  }
  const d = Math.floor(diff / 86400000);
  const h = Math.floor((diff % 86400000) / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  daysEl.textContent    = String(d).padStart(2,'0');
  hoursEl.textContent   = String(h).padStart(2,'0');
  minutesEl.textContent = String(m).padStart(2,'0');
  secondsEl.textContent = String(s).padStart(2,'0');
}
updateCountdown();
setInterval(updateCountdown, 1000);

// Email submit helpers
async function submitEmail(inputId, formRowId, successId, source) {
  const input = document.getElementById(inputId);
  const email = input.value.trim();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) {
    input.style.outline = '2px solid #f87171';
    setTimeout(() => input.style.outline = '', 1500);
    return;
  }
  try {
    const res = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source }),
    });
    if (!res.ok && res.status !== 409) throw new Error();
  } catch {
    input.style.outline = '2px solid #f87171';
    setTimeout(() => input.style.outline = '', 1500);
    return;
  }
  document.getElementById(formRowId).style.display = 'none';
  document.getElementById(successId).style.display = 'flex';
}

function handleSubmit()    { submitEmail('emailInput',    'formRow',    'successMsg',    'hero'); }
function handleCtaSubmit() { submitEmail('ctaEmailInput', 'ctaFormRow', 'ctaSuccessMsg', 'cta');  }

// Scroll animations
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      observer.unobserve(e.target);
    }
  });
}, { threshold: 0.15 });

document.querySelectorAll('.animate-in').forEach(el => observer.observe(el));
