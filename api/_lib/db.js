/**
 * Conexão compartilhada com o banco Neon PostgreSQL.
 * Usada por todas as serverless functions da API.
 */

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não definida. Configure a variável de ambiente no Vercel.');
}

const sql = neon(process.env.DATABASE_URL);

/**
 * Collections permitidas (whitelist contra SQL injection).
 * Deve espelhar COLLECTIONS em js/db.js — qualquer coleção ausente aqui
 * não persiste no modo Neon (GET retorna 404, POST falha).
 */
const ALLOWED_COLLECTIONS = new Set([
  'equipe', 'capa', 'capaAcoes', 'rnc', 'rncAcoes', 'fornecedores',
  'tecno', 'validacoes', 'gcm', 'gcmAcoes', 'risco', 'pragas', 'obrigacoes', 'documentos', 'solicitacoes', 'perfis', 'trilha',
  'atividades', 'reservatorio', 'residuos', 'microbiologico', 'limpezaMensal', 'gembaWalk', 'orcamentosAnuais', 'docsAdmin',
  'reclamacoes', 'auditorias', 'assistenciaTecnica', 'revisaoGerencialAtas', 'projetos',
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

