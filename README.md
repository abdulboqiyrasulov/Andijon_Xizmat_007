# Sartaroshxona — onlayn yozilish sayti

Mijoz xizmat va vaqt tanlab yoziladi; sartarosh (admin) xizmatlarni boshqaradi va yozilishlarni ko'radi.

## Ishga tushirish

Faqat **Python 3.8+** kerak (qo'shimcha paket o'rnatish shart emas).

```
python server/app.py
```

- Mijoz sahifasi: http://127.0.0.1:8000/
- Admin: http://127.0.0.1:8000/admin.html

Birinchi ishga tushganda admin hisobi yaratiladi va **parol terminalda bir marta ko'rsatiladi**.
Login/parolni o'zingiz belgilash uchun: `python server/app.py setadmin`
(yoki birinchi ishga tushirishdan oldin `ADMIN_LOGIN` va `ADMIN_PASSWORD` muhit o'zgaruvchilarini bering).

Sozlamalar (muhit o'zgaruvchilari): `HOST`, `PORT`, `DB_PATH`, `SECURE_COOKIE=1` (HTTPS ortida).

## Tuzilma

- `site/` — mijoz sahifasi (`index.html`), admin kirish (`admin.html`), admin paneli (`panel.html`)
- `server/app.py` — server va API, SQLite baza (`server/data.db`, avtomatik yaratiladi)
- `ui_ux/` — dizayn maketi

## Xavfsizlik

- Admin paroli bazada scrypt bilan shifrlangan holda saqlanadi.
- Admin API va `panel.html` sessiyasiz ochilmaydi (HttpOnly, SameSite=Strict cookie).
- Bir vaqtga ikki yozilish serverda tranzaksiya bilan to'sib qo'yilgan.
- Noto'g'ri login urinishlari cheklangan (5 ta / 5 daqiqa).
- Internetga chiqarishda HTTPS orqasida ishga tushiring.

## Ish vaqti sozlamasi

Ish vaqti (09:00–19:00) va qadam (30 daqiqa) bazadagi `settings` jadvalida saqlanadi.
