'use strict';
if (isLoggedIn()) location.replace('panel.html');

const $ = id => document.getElementById(id);
function setErr(f, msg) { const b = $('f-' + f); b.classList.add('bad'); const e = b.querySelector('.err'); e.textContent = msg; e.hidden = false; }
function clr(f) { const b = $('f-' + f); b.classList.remove('bad'); b.querySelector('.err').hidden = true; }

$('login').addEventListener('input', () => { clr('login'); $('auth-err').hidden = true; });
$('pass').addEventListener('input', () => { clr('pass'); $('auth-err').hidden = true; });

$('form').addEventListener('submit', async e => {
  e.preventDefault();
  clr('login'); clr('pass'); $('auth-err').hidden = true;
  const login = $('login').value.trim(), password = $('pass').value;
  let bad = false;
  if (!login) { setErr('login', 'Loginni kiriting'); bad = true; }
  if (!password) { setErr('pass', 'Parolni kiriting'); bad = true; }
  if (bad) return;
  let ok = false;
  try { ok = await tryLogin(login, password); } catch { ok = false; }
  if (ok) location.replace('panel.html');
  else { $('auth-err').hidden = false; $('f-pass').classList.add('bad'); }
});
