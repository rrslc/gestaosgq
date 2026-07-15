/**
 * @fileoverview Sessão global de usuário — login/logout persistido em localStorage.
 * TTL de 8 horas (jornada de trabalho padrão).
 */

const KEY = 'sgq_session';
const TTL = 8 * 60 * 60 * 1000;

export function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return null;
    if (s.expires && Date.now() > s.expires) { clearSession(); return null; }
    return s;
  } catch { return null; }
}

export function setSession(user) {
  localStorage.setItem(KEY, JSON.stringify({ ...user, expires: Date.now() + TTL }));
}

export function clearSession() {
  localStorage.removeItem(KEY);
}
