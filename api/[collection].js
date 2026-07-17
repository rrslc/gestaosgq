/**
 * GET  /api/:collection  → lista todos os registros
 * POST /api/:collection  → cria um novo registro
 */

const { sql, isAllowed } = require('./_lib/db');
const { requireAuth } = require('./_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { collection } = req.query;

  if (!isAllowed(collection)) {
    return res.status(404).json({ error: `Collection "${collection}" não encontrada.` });
  }

  try {
    if (req.method === 'GET') {
      const rows = await sql(
        `SELECT id, data, created_at, updated_at
         FROM sgq_records
         WHERE collection = $1
         ORDER BY id ASC`,
        [collection]
      );
      const items = rows.map(r => ({ id: r.id, ...r.data }));
      return res.status(200).json(items);
    }

    if (req.method === 'POST') {
      if (!requireAuth(req, res)) return;
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Body inválido.' });
      }

      // Calcula RPN automaticamente para riscos
      if (collection === 'risco' && body.severidade && body.probabilidade) {
        body.rpn = Number(body.severidade) * Number(body.probabilidade);
      }

      const [row] = await sql(
        `INSERT INTO sgq_records (collection, data)
         VALUES ($1, $2)
         RETURNING id, data`,
        [collection, JSON.stringify(body)]
      );
      return res.status(201).json({ id: row.id, ...row.data });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    console.error(`[API] Erro em ${collection}:`, err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
