#!/usr/bin/env python3
"""Sartaroshxona yozilish sayti — server.

Faqat Python standart kutubxonasi (pip install shart emas). Python 3.8+.
  python server/app.py                 # serverni ishga tushirish
  python server/app.py setadmin        # admin login/parolini o'rnatish yoki almashtirish

Ma'lumotlar bazasi: SQLite (server/data.db). Admin paroli scrypt bilan
shifrlangan holda saqlanadi. Admin API va panel sahifasi sessiyasiz ochilmaydi.
"""
import getpass
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import sys
import threading
import time
from datetime import date, datetime, timedelta, timezone
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE = Path(__file__).resolve().parent
SITE = (BASE.parent / "site").resolve()
DB_PATH = os.environ.get("DB_PATH", str(BASE / "data.db"))
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
SECURE_COOKIE = os.environ.get("SECURE_COOKIE") == "1"   # HTTPS ortida 1 qiling
SESSION_TTL = 8 * 3600
TZ = timezone(timedelta(hours=5))                        # O'zbekiston (UTC+5, yozgi vaqt yo'q)
STATIC_EXT = {".html", ".css", ".js"}
MAX_BODY = 10_000

DEFAULT_SETTINGS = {"open": "09:00", "close": "19:00", "step": "30"}
DEFAULT_SERVICES = [("Soch olish", 50000, 30), ("Soqol olish", 30000, 30), ("Soch + soqol", 70000, 60)]


# ---------------------------------------------------------------- baza
def connect():
    db = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)  # qo'lda tranzaksiya
    db.row_factory = sqlite3.Row
    return db


def init_db():
    db = connect()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS services(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, price INTEGER NOT NULL, duration INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS bookings(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL, phone TEXT NOT NULL,
            service_id INTEGER, service TEXT NOT NULL, price INTEGER NOT NULL, duration INTEGER NOT NULL,
            date TEXT NOT NULL, start INTEGER NOT NULL, created TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(date, start);
        CREATE TABLE IF NOT EXISTS admin(
            id INTEGER PRIMARY KEY CHECK (id = 1), login TEXT NOT NULL, pass_hash TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, expires INTEGER NOT NULL);
        """
    )
    for k, v in DEFAULT_SETTINGS.items():
        db.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))
    if db.execute("SELECT COUNT(*) FROM services").fetchone()[0] == 0:
        db.executemany("INSERT INTO services(name, price, duration) VALUES (?, ?, ?)", DEFAULT_SERVICES)
    if not db.execute("SELECT 1 FROM admin").fetchone():
        login = os.environ.get("ADMIN_LOGIN", "admin")
        password = os.environ.get("ADMIN_PASSWORD")
        generated = password is None
        if generated:
            password = secrets.token_urlsafe(9)
        set_admin(db, login, password)
        print("=" * 56)
        print(" Admin hisobi yaratildi")
        print(f"   login: {login}")
        if generated:
            print(f"   parol: {password}   (faqat hozir ko'rsatiladi; saqlab qo'ying)")
        print(" Almashtirish: python server/app.py setadmin")
        print("=" * 56)
    db.close()


# ---------------------------------------------------------------- parol
def hash_password(password):
    salt = secrets.token_bytes(16)
    h = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${h.hex()}"


def check_password(password, stored):
    try:
        _, salt, h = stored.split("$")
        calc = hashlib.scrypt(password.encode("utf-8"), salt=bytes.fromhex(salt), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except (ValueError, TypeError):
        return False


def set_admin(db, login, password):
    db.execute(
        "INSERT INTO admin(id, login, pass_hash) VALUES (1, ?, ?) "
        "ON CONFLICT(id) DO UPDATE SET login = excluded.login, pass_hash = excluded.pass_hash",
        (login, hash_password(password)),
    )
    db.execute("DELETE FROM sessions")  # parol almashsa eski sessiyalar bekor


# ---------------------------------------------------------------- yordamchilar
class ApiError(Exception):
    def __init__(self, status, message, field=None):
        super().__init__(message)
        self.status, self.message, self.field = status, message, field


def get_settings(db):
    s = {r["key"]: r["value"] for r in db.execute("SELECT key, value FROM settings")}
    return {"open": s["open"], "close": s["close"], "step": int(s["step"])}


def to_min(t):
    h, m = t.split(":")
    return int(h) * 60 + int(m)


def to_time(m):
    return f"{m // 60:02d}:{m % 60:02d}"


def now_local():
    return datetime.now(TZ)


def parse_date(s):
    if not isinstance(s, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", s):
        raise ValueError
    return datetime.strptime(s, "%Y-%m-%d").date()


def format_phone(raw):
    if not isinstance(raw, str) or not re.fullmatch(r"\+?[\d ]+", raw.strip()):
        return None
    digits = re.sub(r"\D", "", raw)
    if not re.fullmatch(r"998\d{9}", digits):
        return None
    d = digits[3:]
    return f"+998 {d[:2]} {d[2:5]} {d[5:7]} {d[7:9]}"


def pos_int(v, maximum):
    if isinstance(v, bool) or not isinstance(v, int) or v <= 0 or v > maximum:
        return None
    return v


def service_row(r):
    return {"id": r["id"], "name": r["name"], "price": r["price"], "duration": r["duration"]}


def validate_service(d):
    name = d.get("name")
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise ApiError(400, "Xizmat nomini kiriting", "name")
    if len(name) > 100:
        raise ApiError(400, "Xizmat nomi juda uzun", "name")
    price = pos_int(d.get("price"), 100_000_000)
    if price is None:
        raise ApiError(400, "Narx musbat butun son bo'lsin", "price")
    duration = pos_int(d.get("duration"), 600)
    if duration is None:
        raise ApiError(400, "Davomiylik musbat butun son bo'lsin", "duration")
    return name, price, duration


# ---------------------------------------------------------------- yozilish
def create_booking(db, d):
    name = d.get("name")
    name = name.strip() if isinstance(name, str) else ""
    if not name:
        raise ApiError(400, "Ismingizni kiriting", "name")
    if len(name) > 100:
        raise ApiError(400, "Ism juda uzun", "name")
    phone = format_phone(d.get("phone"))
    if not phone:
        raise ApiError(400, "Raqam +998 XX XXX XX XX ko'rinishida bo'lsin", "phone")
    sid = d.get("serviceId")
    svc = db.execute("SELECT * FROM services WHERE id = ?", (sid,)).fetchone() if isinstance(sid, int) else None
    if not svc:
        raise ApiError(400, "Xizmatni tanlang", "service")
    try:
        day = parse_date(d.get("date"))
    except ValueError:
        raise ApiError(400, "Sanani tanlang", "date")
    now = now_local()
    if day < now.date():
        raise ApiError(400, "O'tgan sanani tanlab bo'lmaydi", "date")
    t = d.get("time")
    if not isinstance(t, str) or not re.fullmatch(r"\d{2}:\d{2}", t):
        raise ApiError(400, "Vaqtni tanlang", "time")
    cfg = get_settings(db)
    start, opening, closing = to_min(t), to_min(cfg["open"]), to_min(cfg["close"])
    if start < opening or start + svc["duration"] > closing or (start - opening) % cfg["step"] != 0:
        raise ApiError(400, "Vaqtni tanlang", "time")
    if day == now.date() and start <= now.hour * 60 + now.minute:
        raise ApiError(409, "Bu vaqt band, boshqasini tanlang", "time")

    db.execute("BEGIN IMMEDIATE")  # bir vaqtga ikki kishi yozilmasligi uchun
    try:
        busy = db.execute(
            "SELECT 1 FROM bookings WHERE date = ? AND start < ? AND start + duration > ? LIMIT 1",
            (day.isoformat(), start + svc["duration"], start),
        ).fetchone()
        if busy:
            db.execute("ROLLBACK")
            raise ApiError(409, "Bu vaqt band, boshqasini tanlang", "time")
        db.execute(
            "INSERT INTO bookings(name, phone, service_id, service, price, duration, date, start, created) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (name, phone, svc["id"], svc["name"], svc["price"], svc["duration"],
             day.isoformat(), start, now.isoformat(timespec="seconds")),
        )
        db.execute("COMMIT")
    except ApiError:
        raise
    except Exception:
        db.execute("ROLLBACK")
        raise
    return {"service": svc["name"], "price": svc["price"], "date": day.isoformat(), "time": t}


# ---------------------------------------------------------------- sessiya
_fails = {}
_fails_lock = threading.Lock()


def too_many_fails(ip):
    with _fails_lock:
        n, first = _fails.get(ip, (0, time.time()))
        if time.time() - first > 300:
            _fails.pop(ip, None)
            return False
        return n >= 5


def note_fail(ip):
    with _fails_lock:
        n, first = _fails.get(ip, (0, time.time()))
        _fails[ip] = (n + 1, first if n else time.time())


def clear_fails(ip):
    with _fails_lock:
        _fails.pop(ip, None)


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


# ---------------------------------------------------------------- HTTP
class Handler(BaseHTTPRequestHandler):
    server_version = "Sartarosh"
    sys_version = ""

    # -- umumiy
    def _send(self, status, body=b"", ctype="application/json; charset=utf-8", headers=None):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status, obj, headers=None):
        self._send(status, json.dumps(obj, ensure_ascii=False).encode("utf-8"), headers=headers)

    def _body(self):
        ctype = (self.headers.get("Content-Type") or "").split(";")[0].strip()
        if ctype != "application/json":
            raise ApiError(415, "Content-Type application/json bo'lsin")
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            raise ApiError(400, "So'rov noto'g'ri")
        try:
            data = json.loads(self.rfile.read(n).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise ApiError(400, "So'rov noto'g'ri")
        if not isinstance(data, dict):
            raise ApiError(400, "So'rov noto'g'ri")
        return data

    def _session_token(self):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        c = SimpleCookie()
        try:
            c.load(raw)
        except Exception:
            return None
        return c["sid"].value if "sid" in c else None

    def _is_admin(self, db):
        tok = self._session_token()
        if not tok:
            return False
        row = db.execute("SELECT expires FROM sessions WHERE token_hash = ?", (token_hash(tok),)).fetchone()
        if row and row["expires"] > time.time():
            return True
        if row:
            db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(tok),))
        return False

    def _cookie(self, value, max_age):
        flags = "HttpOnly; SameSite=Strict; Path=/" + ("; Secure" if SECURE_COOKIE else "")
        return {"Set-Cookie": f"sid={value}; Max-Age={max_age}; {flags}"}

    # -- yo'naltirish
    def do_GET(self): self._route()
    def do_HEAD(self): self._route()
    def do_POST(self): self._route()
    def do_PUT(self): self._route()
    def do_DELETE(self): self._route()

    def _route(self):
        try:
            url = urlparse(self.path)
            if url.path.startswith("/api/"):
                db = connect()
                try:
                    self._api(db, url)
                finally:
                    db.close()
            elif self.command in ("GET", "HEAD"):
                self._static(url.path)
            else:
                raise ApiError(405, "Ruxsat yo'q")
        except ApiError as e:
            body = {"error": e.message}
            if e.field:
                body["field"] = e.field
            self._json(e.status, body)
        except Exception as e:  # noqa: BLE001
            sys.stderr.write(f"Xato: {e!r}\n")
            self._json(500, {"error": "Server xatosi"})

    # -- API
    def _api(self, db, url):
        m, p, q = self.command, url.path.rstrip("/"), parse_qs(url.query)

        # ochiq (mijoz) endpointlar
        if m == "GET" and p == "/api/config":
            return self._json(200, get_settings(db))
        if m == "GET" and p == "/api/services":
            rows = db.execute("SELECT * FROM services ORDER BY id").fetchall()
            return self._json(200, [service_row(r) for r in rows])
        if m == "GET" and p == "/api/busy":
            try:
                day = parse_date((q.get("date") or [""])[0])
            except ValueError:
                raise ApiError(400, "Sana noto'g'ri")
            rows = db.execute("SELECT start, duration FROM bookings WHERE date = ?", (day.isoformat(),)).fetchall()
            return self._json(200, [{"start": r["start"], "duration": r["duration"]} for r in rows])
        if m == "POST" and p == "/api/bookings":
            return self._json(201, create_booking(db, self._body()))

        # admin kirish / chiqish
        if m == "POST" and p == "/api/admin/login":
            ip = self.client_address[0]
            if too_many_fails(ip):
                raise ApiError(429, "Juda ko'p urinish. Birozdan keyin qayta urinib ko'ring")
            d = self._body()
            login, password = d.get("login"), d.get("password")
            row = db.execute("SELECT * FROM admin WHERE id = 1").fetchone()
            ok = (isinstance(login, str) and isinstance(password, str) and row is not None
                  and hmac.compare_digest(login, row["login"]) and check_password(password, row["pass_hash"]))
            if not ok:
                note_fail(ip)
                raise ApiError(401, "Login yoki parol xato")
            clear_fails(ip)
            token = secrets.token_urlsafe(32)
            db.execute("DELETE FROM sessions WHERE expires < ?", (time.time(),))
            db.execute("INSERT INTO sessions(token_hash, expires) VALUES (?, ?)",
                       (token_hash(token), int(time.time()) + SESSION_TTL))
            return self._json(200, {"ok": True}, headers=self._cookie(token, SESSION_TTL))
        if m == "POST" and p == "/api/admin/logout":
            tok = self._session_token()
            if tok:
                db.execute("DELETE FROM sessions WHERE token_hash = ?", (token_hash(tok),))
            return self._json(200, {"ok": True}, headers=self._cookie("", 0))

        # quyidagilar faqat admin uchun
        if p.startswith("/api/admin"):
            if not self._is_admin(db):
                raise ApiError(401, "Kirish talab qilinadi")
            if m == "GET" and p == "/api/admin/me":
                return self._json(200, {"ok": True})
            if m == "GET" and p == "/api/admin/bookings":
                rows = db.execute("SELECT * FROM bookings ORDER BY date, start, id").fetchall()
                return self._json(200, [{
                    "id": r["id"], "date": r["date"], "time": to_time(r["start"]), "name": r["name"],
                    "phone": r["phone"], "service": r["service"], "price": r["price"]} for r in rows])
            if m == "POST" and p == "/api/admin/services":
                name, price, duration = validate_service(self._body())
                cur = db.execute("INSERT INTO services(name, price, duration) VALUES (?, ?, ?)", (name, price, duration))
                return self._json(201, {"id": cur.lastrowid, "name": name, "price": price, "duration": duration})
            mt = re.fullmatch(r"/api/admin/services/(\d+)", p)
            if mt:
                sid = int(mt.group(1))
                if not db.execute("SELECT 1 FROM services WHERE id = ?", (sid,)).fetchone():
                    raise ApiError(404, "Xizmat topilmadi")
                if m == "PUT":
                    name, price, duration = validate_service(self._body())
                    db.execute("UPDATE services SET name = ?, price = ?, duration = ? WHERE id = ?",
                               (name, price, duration, sid))
                    return self._json(200, {"id": sid, "name": name, "price": price, "duration": duration})
                if m == "DELETE":
                    db.execute("DELETE FROM services WHERE id = ?", (sid,))
                    return self._json(200, {"ok": True})
        raise ApiError(404, "Topilmadi")

    # -- statik fayllar
    def _static(self, path):
        if path == "/":
            path = "/index.html"
        target = (SITE / path.lstrip("/")).resolve()
        try:
            target.relative_to(SITE)
        except ValueError:
            raise ApiError(404, "Topilmadi")
        if target.suffix not in STATIC_EXT or not target.is_file():
            raise ApiError(404, "Topilmadi")
        if target.name == "panel.html":  # login qilmasdan panel sahifasi ham berilmaydi
            db = connect()
            try:
                allowed = self._is_admin(db)
            finally:
                db.close()
            if not allowed:
                return self._send(302, b"", headers={"Location": "/admin.html"})
        ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype.endswith("javascript"):
            ctype += "; charset=utf-8"
        self._send(200, target.read_bytes(), ctype)


def main():
    init_db()
    if len(sys.argv) > 1 and sys.argv[1] == "setadmin":
        login = input("Yangi login: ").strip()
        password = getpass.getpass("Yangi parol (kamida 8 belgi): ")
        if not login or len(password) < 8:
            sys.exit("Login bo'sh bo'lmasin, parol kamida 8 belgi bo'lsin.")
        if password != getpass.getpass("Parolni takrorlang: "):
            sys.exit("Parollar mos kelmadi.")
        db = connect()
        set_admin(db, login, password)
        db.close()
        print("Admin hisobi yangilandi.")
        return
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    print(f"Sayt: http://{HOST}:{PORT}/   Admin: http://{HOST}:{PORT}/admin.html   (to'xtatish: Ctrl+C)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nTo'xtatildi.")


if __name__ == "__main__":
    main()
