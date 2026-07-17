/**
 * @fileoverview Hash de senhas (SHA-256) — mitigação client-side contra exposição
 * de senhas em texto puro (localStorage, DevTools, backup exportado).
 * Não substitui autenticação server-side real: a API não valida sessões (ver
 * api/[collection].js), então isto reduz exposição acidental, não é uma
 * garantia criptográfica forte sem um backend de autenticação dedicado.
 */

export async function hashPassword(plain) {
  const enc = new TextEncoder().encode(plain);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** true se a string já parece um hash SHA-256 (64 caracteres hexadecimais). */
export function looksHashed(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
}
