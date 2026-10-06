/**
 * POST /api/bootstrap → define a PRIMEIRA senha de um colaborador que ainda não
 * tem senha, e emite um token de sessão. É o equivalente, no modo Neon, ao
 * "primeiro acesso" do portal (que no modo local grava direto no navegador).
 *
 * Segurança: só funciona para um colaborador SEM senha. Se já houver senha,
 * retorna 409 e a pessoa deve entrar pelo /api/login normal. Isso impede
 * sobrescrever a senha de alguém. Em produção, o Administrador provisiona as
 * demais senhas em Sistema → Equipe, deixando as contas sem "primeiro acesso"
 * em aberto.
 */

const { sql } = require('./_lib/db');
const { sign } = require('./_lib/auth');

const TTL_MS = 8 * 60 * 60 * 1000; // 8 horas — mesma jornada de js/session.js

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido.' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { nome, senhaHash } = body || {};
    // senhaHash é um SHA-256 em hex (64 chars). Exige um valor plausível.
    if (!nome || !senhaHash || typeof senhaHash !== 'string' || senhaHash.length < 32) {
      return res.status(400).json({ error: 'Nome e senha são obrigatórios.' });
    }

    const rows = await sql(
      `SELECT id, data FROM sgq_records WHERE collection = 'equipe' AND data->>'nome' = $1`,
      [nome]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Colaborador não encontrado.' });
    if (row.data.senha) {
      return res.status(409).json({ error: 'Este colaborador já possui senha. Faça login normalmente.' });
    }

    const novoData = { ...row.data, senha: senhaHash };
    await sql(
      `UPDATE sgq_records SET data = $1, updated_at = NOW() WHERE id = $2 AND collection = 'equipe'`,
      [JSON.stringify(novoData), row.id]
    );

    const exp = Date.now() + TTL_MS;
    const token = sign({ uid: row.id, nome: novoData.nome, perfil: novoData.perfil, exp });
    const { senha, ...safeUser } = novoData;
    return res.status(200).json({ token, exp, user: { id: row.id, ...safeUser } });
  } catch (err) {
    console.error('[API] Erro em /bootstrap:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
