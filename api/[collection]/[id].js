/**
 * PUT    /api/:collection/:id  → atualiza um registro
 * DELETE /api/:collection/:id  → remove um registro
 */

const { sql, isAllowed } = require('../_lib/db');
const { requireAuth } = require('../_lib/auth');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const { collection, id } = req.query;
  const numId = Number(id);

  if (!isAllowed(collection)) {
    return res.status(404).json({ error: `Collection "${collection}" não encontrada.` });
  }

  if (!Number.isInteger(numId) || numId < 1) {
    return res.status(400).json({ error: 'ID inválido.' });
  }

  if (!requireAuth(req, res)) return;

  try {
    if (req.method === 'PUT') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      if (!body || typeof body !== 'object') {
        return res.status(400).json({ error: 'Body inválido.' });
      }

      // Recalcula RPN para riscos
      if (collection === 'risco' && body.severidade && body.probabilidade) {
        body.rpn = Number(body.severidade) * Number(body.probabilidade);
      }

      const rows = await sql(
        `UPDATE sgq_records
         SET data = $1, updated_at = NOW()
         WHERE id = $2 AND collection = $3
         RETURNING id, data`,
        [JSON.stringify(body), numId, collection]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }

      return res.status(200).json({ id: rows[0].id, ...rows[0].data });
    }

    if (req.method === 'DELETE') {
      const rows = await sql(
        `DELETE FROM sgq_records
         WHERE id = $1 AND collection = $2
         RETURNING id`,
        [numId, collection]
      );

      if (!rows.length) {
        return res.status(404).json({ error: 'Registro não encontrado.' });
      }

      return res.status(200).json({ deleted: true, id: numId });
    }

    return res.status(405).json({ error: 'Método não permitido.' });
  } catch (err) {
    console.error(`[API] Erro em ${collection}/${id}:`, err);
    return res.status(500).json({ error: 'Erro interno do servidor.' });
  }
};
