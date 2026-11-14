'use strict';
const $ = id => document.getElementById(id);
function setErr(f, msg) { const b = $('f-' + f); b.classList.add('bad'); const e = b.querySelector('.err'); e.textContent = msg; e.hidden = false; }
function clr(f) { const b = $('f-' + f); b.classList.remove('bad'); b.querySelector('.err').hidden = true; }

// allaqachon kirgan bo'lsa, to'g'ridan-to'g'ri panelga
api('GET', '/api/admin/me').then(r => { if (r.ok) location.replace('panel.html'); });

$('login').addEventListener('input', () => { clr('login'); $('auth-err').hidden = true; });
$('pass').addEventListener('input', () => { clr('pass'); $('auth-err').hidden = true; });

let busy = false;
$('form').addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  clr('login'); clr('pass'); $('auth-err').hidden = true;
  const login = $('login').value.trim(), password = $('pass').value;
  let bad = false;
  if (!login) { setErr('login', 'Loginni kiriting'); bad = true; }
  if (!password) { setErr('pass', 'Parolni kiriting'); bad = true; }
  if (bad) return;

  busy = true;
  const r = await api('POST', '/api/admin/login', { login, password });
  busy = false;
  if (r.ok) { location.replace('panel.html'); return; }
  const box = $('auth-err');
  box.textContent = r.status === 401 ? 'Login yoki parol xato' : ((r.data && r.data.error) || 'Xatolik yuz berdi');
  box.hidden = false;
  if (r.status === 401) $('f-pass').classList.add('bad');
});
