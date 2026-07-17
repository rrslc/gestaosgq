/**
 * POST /api/login → verifica a senha (hash SHA-256, calculado no navegador) contra
 * o registro de equipe armazenado no Neon e emite um token de sessão assinado.
 * A senha em texto puro nunca chega ao servidor.
 */

const { sql } = require('./_lib/db');
const { sign } = require('./_lib/auth');

const TTL_MS = 8 * 60 * 60 * 1000; // 8 horas — mesma jornada usada em js/session.js

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { nome, senhaHash } = body || {};
    if (!nome || !senhaHash) {
      return res.status(400).json({ error: 'Nome e senha são obrigatórios.' });
    }

    const rows = await sql(
      `SELECT id, data FROM sgq_records WHERE collection = 'equipe' AND data->>'nome' = $1`,
      [nome]
    );
    const row = rows[0];

    if (!row || !row.data.senha || row.data.senha !== senhaHash) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const exp = Date.now() + TTL_MS;
    const token = sign({ uid: row.id, nome: row.data.nome, perfil: row.data.perfil, exp });
    const { senha, ...safeUser } = row.data;

    return res.status(200).json({ token, exp, user: { id: row.id, ...safeUser } });
  } catch (err) {
    console.error('[API] Erro em /login:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
