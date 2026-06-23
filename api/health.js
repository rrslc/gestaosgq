/**
 * GET /api/health → verifica se a API e o banco estão operacionais.
 * Usado pelo frontend para detectar se o modo online está disponível.
 */

const { sql } = require('./_lib/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    await sql('SELECT 1');
    return res.status(200).json({ ok: true, mode: 'neon' });
  } catch (err) {
    return res.status(503).json({ ok: false, error: err.message });
  }
};
