'use strict';

/* ---------- Holat va sozlamalar ---------- */
let SETTINGS = { open: '09:00', close: '19:00', step: 30 }; // server /api/config dan yangilanadi
let services = [];
let busy = [];                 // tanlangan sanadagi band oraliqlar: [{start, duration}]
const state = { name: '', phone: '', serviceId: null, date: '', time: null };

const $ = id => document.getElementById(id);
const el = { name: $('name'), phone: $('phone'), date: $('date'), services: $('services'), slots: $('slots') };

const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const money = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm";
const fmtDate = s => { const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };
const currentService = () => services.find(s => s.id === state.serviceId) || null;

/** Oraliq [startMin, startMin+dur) bo'shmi? (yakuniy tekshiruv serverda ham bajariladi) */
function isFree(date, startMin, dur) {
  if (startMin + dur > toMin(SETTINGS.close)) return false;
  if (date === todayStr() && startMin <= nowMin()) return false;
  return !busy.some(b => startMin < b.start + b.duration && b.start < startMin + dur);
}

/* ---------- Serverdan yuklash ---------- */
async function loadConfig() {
  const r = await api('GET', '/api/config');
  if (r.ok) SETTINGS = r.data;
}
async function loadServices() {
  const r = await api('GET', '/api/services');
  if (r.ok) { services = r.data; el.services.dataset.failed = ''; }
  else el.services.dataset.failed = '1';
  renderServices();
}
async function loadBusy() {
  if (!state.date) { busy = []; return; }
  const r = await api('GET', '/api/busy?date=' + encodeURIComponent(state.date));
  if (r.ok) busy = r.data;
}

/* ---------- Xizmatlar ---------- */
function renderServices() {
  if (!services.some(s => s.id === state.serviceId)) state.serviceId = null;
  el.services.innerHTML = '';
  if (el.services.dataset.failed) { el.services.innerHTML = '<div class="empty">Xizmatlarni yuklab bo\'lmadi. Sahifani yangilang.</div>'; return; }
  if (!services.length) { el.services.innerHTML = '<div class="empty">Hozircha xizmatlar yo\'q</div>'; return; }
  services.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'svc'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(s.id === state.serviceId));
    const info = document.createElement('span');
    const nm = document.createElement('b'); nm.textContent = s.name;
    const sm = document.createElement('small'); sm.textContent = s.duration + ' daqiqa';
    info.append(nm, sm);
    const p = document.createElement('span'); p.className = 'p'; p.textContent = money(s.price);
    b.append(info, p);
    b.addEventListener('click', () => { state.serviceId = s.id; clearError('service'); renderServices(); renderSlots(); });
    el.services.appendChild(b);
  });
}

/* ---------- Vaqt slotlari ---------- */
function renderSlots() {
  el.slots.innerHTML = '';
  const svc = currentService();
  const dur = svc ? svc.duration : SETTINGS.step;
  const date = state.date;
  const start = toMin(SETTINGS.open), end = toMin(SETTINGS.close);

  if (state.time && (!date || !isFree(date, toMin(state.time), dur))) state.time = null;

  for (let m = start; m < end; m += SETTINGS.step) {
    const t = toTime(m);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'slot'; b.textContent = t; b.setAttribute('role', 'radio');
    b.disabled = !(date && isFree(date, m, dur));
    b.setAttribute('aria-checked', String(state.time === t));
    b.addEventListener('click', () => { state.time = t; clearError('time'); renderSlots(); });
    el.slots.appendChild(b);
  }
}

/* ---------- Telefon ---------- */
function formatPhone(raw) {
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('998')) d = d.slice(3);
  d = d.slice(0, 9);
  let out = '+998';
  if (d.length) out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}
const phoneValid = v => /^\+998 \d{2} \d{3} \d{2} \d{2}$/.test(v);

/* ---------- Xatolar ---------- */
function setError(field, msg) {
  const box = $('f-' + field); box.classList.add('bad');
  const e = box.querySelector('.err'); e.textContent = msg; e.hidden = false;
}
function clearError(field) {
  const box = $('f-' + field); box.classList.remove('bad');
  box.querySelector('.err').hidden = true;
}
function validate() {
  ['name', 'phone', 'service', 'date', 'time'].forEach(clearError);
  const errs = [];
  if (!state.name.trim()) errs.push(['name', 'Ismingizni kiriting']);
  if (!state.phone.trim() || state.phone.trim() === '+998') errs.push(['phone', 'Telefon raqamingizni kiriting']);
  else if (!phoneValid(state.phone)) errs.push(['phone', "Raqam +998 XX XXX XX XX ko'rinishida bo'lsin"]);
  if (!state.serviceId) errs.push(['service', 'Xizmatni tanlang']);
  if (!state.date) errs.push(['date', 'Sanani tanlang']);
  else if (state.date < todayStr()) errs.push(['date', "O'tgan sanani tanlab bo'lmaydi"]);
  if (!state.time) errs.push(['time', 'Vaqtni tanlang']);
  errs.forEach(([f, m]) => setError(f, m));
  if (errs.length) $('f-' + errs[0][0]).scrollIntoView({ behavior: 'smooth', block: 'center' });
  return !errs.length;
}

/* ---------- Tasdiqlash oynasi ---------- */
const modal = $('modal');
let lastFocus = null, sending = false;

function openModal() {
  const svc = currentService();
  $('s-name').textContent = state.name.trim();
  $('s-phone').textContent = state.phone;
  $('s-service').textContent = svc.name;
  $('s-date').textContent = fmtDate(state.date);
  $('s-time').textContent = state.time;
  $('s-price').textContent = money(svc.price);
  $('m-error').hidden = true;
  $('m-confirm').hidden = false; $('m-done').hidden = true;
  lastFocus = document.activeElement;
  modal.hidden = false;
  $('btn-ok').focus();
}
function closeModal() { modal.hidden = true; if (lastFocus) lastFocus.focus(); }

async function confirmBooking() {
  if (sending) return;
  sending = true; $('btn-ok').disabled = true;
  const svc = currentService();
  const r = await api('POST', '/api/bookings', {
    name: state.name.trim(), phone: state.phone, serviceId: state.serviceId, date: state.date, time: state.time,
  });
  sending = false; $('btn-ok').disabled = false;

  if (!r.ok) {
    const e = $('m-error');
    e.textContent = (r.data && r.data.error) || 'Xatolik yuz berdi. Qayta urinib ko\'ring';
    e.hidden = false;
    if (r.status === 409) { state.time = null; await loadBusy(); renderSlots(); }   // vaqt band bo'lib qolgan
    return;
  }
  $('done-text').textContent = `${svc.name} · ${fmtDate(state.date)} · ${state.time}`;
  $('m-confirm').hidden = true; $('m-done').hidden = false;
  $('btn-close').focus();
}

async function resetForm() {
  Object.assign(state, { name: '', phone: '', serviceId: null, time: null });
  el.name.value = ''; el.phone.value = '';
  await loadBusy();
  renderServices(); renderSlots();
}

/* ---------- Hodisalar ---------- */
el.name.addEventListener('input', () => { state.name = el.name.value; clearError('name'); });
el.phone.addEventListener('input', () => { el.phone.value = state.phone = formatPhone(el.phone.value); clearError('phone'); });
el.phone.addEventListener('focus', () => { if (!el.phone.value) el.phone.value = state.phone = '+998'; });
el.date.addEventListener('change', async () => { state.date = el.date.value; clearError('date'); await loadBusy(); renderSlots(); });

$('form').addEventListener('submit', e => { e.preventDefault(); if (validate()) openModal(); });
$('btn-back').addEventListener('click', closeModal);          // ma'lumotlar saqlanib qoladi
$('btn-ok').addEventListener('click', confirmBooking);
$('btn-close').addEventListener('click', () => { closeModal(); resetForm(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden && !$('m-confirm').hidden) closeModal(); });

/* Admin yangi xizmat qo'shsa yoki boshqa mijoz yozilsa, ro'yxat avtomatik yangilanadi */
async function refresh() {
  if (!modal.hidden) return;
  await Promise.all([loadServices(), loadBusy()]);
  renderSlots();
}
setInterval(refresh, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });

/* ---------- Boshlash ---------- */
(async function init() {
  el.date.min = todayStr();
  el.date.value = state.date = todayStr();
  await loadConfig();
  await Promise.all([loadServices(), loadBusy()]);
  renderSlots();
})();
