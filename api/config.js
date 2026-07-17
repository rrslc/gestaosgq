/**
 * GET /api/config  → retorna configuração da empresa
 * PUT /api/config  → atualiza configuração
 */

const { sql } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

const CONFIG_KEY = 'empresa';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const rows = await sql(
        `SELECT value FROM sgq_config WHERE key = $1`,
        [CONFIG_KEY]
      );
      const config = rows.length ? rows[0].value : {};
      return res.status(200).json(config);
    }

    if (req.method === 'PUT') {
      if (!requireAuth(req, res)) return;
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      await sql(
        `INSERT INTO sgq_config (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [CONFIG_KEY, JSON.stringify(body)]
      );
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    console.error('[API] Erro em /config:', err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
