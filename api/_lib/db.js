/**
 * Conexão compartilhada com o banco Neon PostgreSQL.
 * Usada por todas as serverless functions da API.
 */

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida. Configure a variável de ambiente no Vercel.');
}

const sql = neon(process.env.DATABASE_URL);

/** Collections permitidas (whitelist contra SQL injection). */
const ALLOWED_COLLECTIONS = new Set([
  'equipe', 'capa', 'rnc', 'fornecedores',
  'tecno', 'validacoes', 'gcm', 'risco', 'pragas', 'obrigacoes', 'documentos',
]);

/**
 * Valida o nome da collection contra a whitelist.
 * @param {string} collection
 * @returns {boolean}
 */
function isAllowed(collection) {
  return ALLOWED_COLLECTIONS.has(collection);
}

module.exports = { sql, isAllowed };
