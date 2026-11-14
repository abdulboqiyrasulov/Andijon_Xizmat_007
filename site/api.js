'use strict';
/* Serverga so'rov yuborish uchun umumiy yordamchi.
   Natija: { ok, status, data } — tarmoq xatosida status = 0. */
async function api(method, url, body) {
  try {
    const res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch {}
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { error: 'Server bilan aloqa yo\'q' } };
  }
}
