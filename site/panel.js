'use strict';

const $ = id => document.getElementById(id);
const money = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm";
const fmtDate = s => { const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
let services = [];

function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.id); toast.id = setTimeout(() => { t.hidden = true; }, 2400);
}
/** Sessiya tugagan bo'lsa, kirish sahifasiga qaytaradi */
function guard(r) {
  if (r.status === 401) { location.replace('admin.html'); return false; }
  return true;
}

/* ---------- Bo'limlar ---------- */
function showTab(name) {
  const s = name === 'services';
  $('tab-services').setAttribute('aria-selected', String(s));
  $('tab-bookings').setAttribute('aria-selected', String(!s));
  $('sec-services').hidden = !s; $('sec-bookings').hidden = s;
  if (s) loadServices(); else loadBookings();
}
$('tab-services').addEventListener('click', () => showTab('services'));
$('tab-bookings').addEventListener('click', () => showTab('bookings'));
$('btn-logout').addEventListener('click', async () => { await api('POST', '/api/admin/logout', {}); location.replace('admin.html'); });

/* ---------- Xizmatlar ---------- */
async function loadServices() {
  const r = await api('GET', '/api/services');
  if (r.ok) { services = r.data; renderServices(); }
  else toast("Xizmatlarni yuklab bo'lmadi");
}
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
let editingId = null, lastFocus = null, saving = false;
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

$('svc-form').addEventListener('submit', async e => {
  e.preventDefault();
  if (saving) return;
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

  saving = true;
  const body = { name, price, duration };
  const r = editingId === null
    ? await api('POST', '/api/admin/services', body)
    : await api('PUT', '/api/admin/services/' + editingId, body);
  saving = false;
  if (!guard(r)) return;
  if (!r.ok) {
    const f = r.data && r.data.field;
    if (f && fld.includes(f)) setErr(f, r.data.error); else toast((r.data && r.data.error) || 'Saqlab bo\'lmadi');
    return;
  }
  closeForm(); await loadServices(); toast('Saqlandi');
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
$('md-ok').addEventListener('click', async () => {
  const r = await api('DELETE', '/api/admin/services/' + deletingId);
  if (!guard(r)) return;
  closeDelete();
  if (!r.ok && r.status !== 404) { toast((r.data && r.data.error) || "O'chirib bo'lmadi"); return; }
  await loadServices(); toast("O'chirildi");
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!$('modal-form').hidden) closeForm(); else if (!$('modal-del').hidden) closeDelete();
});

/* ---------- Yozilishlar (faqat ko'rish) ---------- */
async function loadBookings() {
  const r = await api('GET', '/api/admin/bookings');   // server sana va vaqt bo'yicha tartiblaydi, eng yaqini birinchi
  if (!guard(r)) return;
  const body = $('bk-body'); body.innerHTML = '';
  if (!r.ok) { toast("Yozilishlarni yuklab bo'lmadi"); return; }
  if (!r.data.length) {
    const tr = document.createElement('tr'); const td = document.createElement('td');
    td.colSpan = 6; td.className = 'empty'; td.textContent = "Hozircha yozilishlar yo'q"; tr.appendChild(td); body.appendChild(tr); return;
  }
  r.data.forEach(b => {
    const tr = document.createElement('tr');
    [fmtDate(b.date), b.time, b.name, b.phone, b.service, money(b.price)].forEach((v, i) => {
      const td = document.createElement('td'); td.textContent = v; if (i === 5) td.className = 'num'; tr.appendChild(td);
    });
    body.appendChild(tr);
  });
}

/* ---------- Boshlash: sessiyani tekshirish ---------- */
(async function init() {
  const r = await api('GET', '/api/admin/me');
  if (!r.ok) { location.replace('admin.html'); return; }
  document.body.hidden = false;
  loadServices();
})();
