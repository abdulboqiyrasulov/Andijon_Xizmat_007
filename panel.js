'use strict';
/* Admin paneli. Ma'lumotlar qatlami: data.js */

let services = getServices();
const $ = id => document.getElementById(id);

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.id); toast.id = setTimeout(() => { t.hidden = true; }, 2200);
}

/* ---------- Bo'limlar ---------- */
function showTab(name) {
  const s = name === 'services';
  $('tab-services').setAttribute('aria-selected', String(s));
  $('tab-bookings').setAttribute('aria-selected', String(!s));
  $('sec-services').hidden = !s; $('sec-bookings').hidden = s;
  if (!s) renderBookings();
}
$('tab-services').addEventListener('click', () => showTab('services'));
$('tab-bookings').addEventListener('click', () => showTab('bookings'));
$('btn-logout').addEventListener('click', () => { logout(); location.replace('admin.html'); });

/* ---------- Xizmatlar ---------- */
function renderServices() {
  const box = $('svc-list'); box.innerHTML = '';
  if (!services.length) {
    const e = document.createElement('div'); e.className = 'empty'; e.textContent = "Xizmatlar yo'q. \"Qo'shish\" tugmasini bosing.";
    box.appendChild(e); return;
  }
  services.forEach(s => {
    const row = document.createElement('div'); row.className = 'item';
    const t = document.createElement('div'); t.className = 't';
    const b = document.createElement('b'); b.textContent = s.name;
    const sm = document.createElement('small'); sm.textContent = s.duration + ' daqiqa';
    t.append(b, sm);
    const p = document.createElement('span'); p.className = 'price'; p.textContent = money(s.price);
    const acts = document.createElement('div'); acts.className = 'acts';
    const ed = document.createElement('button'); ed.type = 'button'; ed.className = 'ib'; ed.textContent = '✎';
    ed.setAttribute('aria-label', 'Tahrirlash: ' + s.name); ed.addEventListener('click', () => openForm(s));
    const de = document.createElement('button'); de.type = 'button'; de.className = 'ib d'; de.textContent = '✕';
    de.setAttribute('aria-label', "O'chirish: " + s.name); de.addEventListener('click', () => openDelete(s));
    acts.append(ed, de);
    row.append(t, p, acts);
    box.appendChild(row);
  });
}

/* --- qo'shish / tahrirlash --- */
let editingId = null, lastFocus = null;
const fld = ['name', 'price', 'duration'];
const inp = { name: $('svc-name'), price: $('svc-price'), duration: $('svc-duration') };
const setErr = (f, m) => { const b = $('f-' + f); b.classList.add('bad'); const e = b.querySelector('.err'); e.textContent = m; e.hidden = false; };
const clrErr = f => { const b = $('f-' + f); b.classList.remove('bad'); b.querySelector('.err').hidden = true; };
fld.forEach(f => inp[f].addEventListener('input', () => clrErr(f)));

function openForm(svc) {
  editingId = svc ? svc.id : null;
  $('mf-title').textContent = svc ? 'Xizmatni tahrirlash' : 'Yangi xizmat';
  inp.name.value = svc ? svc.name : '';
  inp.price.value = svc ? svc.price : '';
  inp.duration.value = svc ? svc.duration : '';
  fld.forEach(clrErr);
  lastFocus = document.activeElement;
  $('modal-form').hidden = false; inp.name.focus();
}
function closeForm() { $('modal-form').hidden = true; if (lastFocus) lastFocus.focus(); }
$('btn-add').addEventListener('click', () => openForm(null));
$('mf-cancel').addEventListener('click', closeForm);

const parsePosInt = v => /^\d+$/.test(v.trim()) && Number(v) > 0 ? Number(v) : null;

$('svc-form').addEventListener('submit', e => {
  e.preventDefault();
  fld.forEach(clrErr);
  const name = inp.name.value.trim();
  const price = parsePosInt(inp.price.value), duration = parsePosInt(inp.duration.value);
  let ok = true;
  if (!name) { setErr('name', 'Xizmat nomini kiriting'); ok = false; }
  if (!inp.price.value.trim()) { setErr('price', 'Narxini kiriting'); ok = false; }
  else if (price === null) { setErr('price', "Narx musbat butun son bo'lsin"); ok = false; }
  if (!inp.duration.value.trim()) { setErr('duration', 'Davomiyligini kiriting'); ok = false; }
  else if (duration === null) { setErr('duration', "Davomiylik musbat butun son bo'lsin"); ok = false; }
  if (!ok) return;

  if (editingId === null) {
    const id = services.reduce((m, s) => Math.max(m, s.id), 0) + 1;
    services.push({ id, name, price, duration });
  } else {
    const s = services.find(x => x.id === editingId);
    if (s) Object.assign(s, { name, price, duration });
  }
  if (!saveServices(services)) { toast("Saqlab bo'lmadi"); return; }
  closeForm(); renderServices(); toast('Saqlandi');
});

/* --- o'chirish --- */
let deletingId = null;
function openDelete(s) {
  deletingId = s.id; lastFocus = document.activeElement;
  $('md-text').textContent = `"${s.name}" xizmati ro'yxatdan olib tashlanadi. Avval qilingan yozilishlar saqlanib qoladi.`;
  $('modal-del').hidden = false; $('md-ok').focus();
}
function closeDelete() { $('modal-del').hidden = true; if (lastFocus) lastFocus.focus(); }
$('md-cancel').addEventListener('click', closeDelete);
$('md-ok').addEventListener('click', () => {
  services = services.filter(s => s.id !== deletingId);
  saveServices(services);
  closeDelete(); renderServices(); toast("O'chirildi");
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('modal-form').hidden) closeForm(); else if (!$('modal-del').hidden) closeDelete();
});

/* ---------- Yozilishlar (faqat ko'rish, eng yaqini birinchi) ---------- */
function renderBookings() {
  const body = $('bk-body'); body.innerHTML = '';
  const list = getBookings().slice().sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  if (!list.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 6; td.className = 'empty'; td.textContent = "Hozircha yozilishlar yo'q"; tr.appendChild(td); body.appendChild(tr); return;
  }
  list.forEach(b => {
    const tr = document.createElement('tr');
    [fmtDate(b.date), b.time, b.name, b.phone, b.service, money(b.price)].forEach((v, i) => {
      const td = document.createElement('td'); td.textContent = v; if (i === 5) td.className = 'num'; tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}
window.addEventListener('storage', e => { if (e.key === KEY_BOOKINGS && !$('sec-bookings').hidden) renderBookings(); });

if (!isLoggedIn()) location.replace('admin.html');
else { document.body.hidden = false; renderServices(); }
