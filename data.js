'use strict';
/* Umumiy ma'lumotlar qatlami. Hamma narsa brauzer xotirasida (localStorage) saqlanadi. */

/* Ish vaqti sozlamasi (keyinroq o'zgartirish uchun shu yerda) */
const SETTINGS = { open: '09:00', close: '19:00', step: 30 };

const KEY_SERVICES = 'services', KEY_BOOKINGS = 'bookings', KEY_ADMIN = 'admin', KEY_SESSION = 'admin_session';
const DEFAULT_SERVICES = [
  { id: 1, name: 'Soch olish',   price: 50000, duration: 30 },
  { id: 2, name: 'Soqol olish',  price: 30000, duration: 30 },
  { id: 3, name: 'Soch + soqol', price: 70000, duration: 60 },
];
const DEFAULT_ADMIN = { login: 'admin', password: 'admin123' };

function load(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key)); return v ?? fallback; } catch { return fallback; } }
function save(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch { return false; } }

/* ---------- Yordamchilar ---------- */
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toTime = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const pad = n => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const money = n => Number(n).toLocaleString('ru-RU').replace(/ /g, ' ') + " so'm";
const fmtDate = s => { const [y, m, d] = s.split('-'); return `${d}.${m}.${y}`; };

/* ---------- Xizmatlar va yozilishlar ---------- */
const getServices = () => load(KEY_SERVICES, DEFAULT_SERVICES);
const saveServices = list => save(KEY_SERVICES, list);
const getBookings = () => load(KEY_BOOKINGS, []);

/** [startMin, startMin+dur) oralig'i bo'shmi? (ish vaqti, o'tgan vaqt va boshqa yozilishlar) */
function isFree(date, startMin, dur) {
  if (startMin + dur > toMin(SETTINGS.close)) return false;
  if (date === todayStr() && startMin <= nowMin()) return false;
  return !getBookings().some(b => b.date === date && startMin < b.start + b.duration && b.start < startMin + dur);
}

/** Yozilishni saqlaydi. Vaqt band bo'lib qolgan bo'lsa false qaytaradi. */
function addBooking(b) {
  if (!isFree(b.date, b.start, b.duration)) return false;
  const all = getBookings(); all.push(b);
  return save(KEY_BOOKINGS, all);
}

/* ---------- Admin kirishi (parol SHA-256 hash ko'rinishida) ---------- */
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getAdmin() {
  const a = load(KEY_ADMIN, null);
  if (a && a.login && a.hash) return a;
  const n = { login: DEFAULT_ADMIN.login, hash: await sha256(DEFAULT_ADMIN.password) };
  save(KEY_ADMIN, n);
  return n;
}
async function tryLogin(login, password) {
  const a = await getAdmin();
  if (login === a.login && (await sha256(password)) === a.hash) {
    try { sessionStorage.setItem(KEY_SESSION, '1'); } catch {}
    return true;
  }
  return false;
}
const isLoggedIn = () => { try { return sessionStorage.getItem(KEY_SESSION) === '1'; } catch { return false; } };
const logout = () => { try { sessionStorage.removeItem(KEY_SESSION); } catch {} };
