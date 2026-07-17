/**
 * Sessão assinada (HMAC-SHA256) para as serverless functions.
 * Sem isso, qualquer requisição direta a /api/:collection pode escrever ou
 * apagar registros (inclusive a trilha de auditoria) sem nenhuma verificação.
 *
 * Requer a variável de ambiente SESSION_SECRET no Vercel (string longa e
 * aleatória). Sem ela, toda escrita passa a falhar — configure antes do deploy.
 */

const crypto = require('crypto');

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET não definida. Configure a variável de ambiente no Vercel.');
  return secret;
}

/** Assina um payload e retorna um token opaco "payload.assinatura". */
function sign(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const sig = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  return `${payload}.${sig}`;
}

/** Verifica um token e retorna o payload decodificado, ou null se inválido/expirado. */
function verify(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;

  let expected;
  try {
    expected = crypto.createHmac('sha256', getSecret()).update(payload).digest('hex');
  } catch {
    return null;
  }

  const a = Buffer.from(sig, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || Date.now() > data.exp) return null;
    return data;
  } catch {
    return null;
  }
}

/** Extrai e valida o token "Authorization: Bearer ..." da requisição. */
function requireAuth(req, res) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const session = verify(token);
  if (!session) {
    res.status(401).json({ error: 'Sessão inválida ou expirada. Faça login novamente.' });
    return null;
  }
  return session;
}

module.exports = { sign, verify, requireAuth };
