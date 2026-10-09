/**
 * POST/GET /api/seed → popula as CONTAS DE TESTE no Neon, usando a conexão que
 * já está nas variáveis de ambiente da Vercel. Bootstrap de uma vez só, sem
 * precisar rodar scripts locais nem expor a DATABASE_URL.
 *
 * Segurança: só insere quando a coleção 'equipe' está VAZIA (idempotente). Se já
 * houver gente cadastrada, não faz nada. ENDPOINT TEMPORÁRIO — remover após o uso.
 */

const { sql } = require('./_lib/db');

// SHA-256 de "Teste@2026" (mesmo algoritmo de js/crypto.js).
const SENHA_TESTE_HASH = 'a444aaaffde8a69f3e2e96b2f93d2d8a78f301f385cf9c171b439e8f3f193567';

const CONTAS = [
  { nome: 'Testador GQ',       iniciais: 'TG', cargo: 'Conta de teste — Garantia da Qualidade', area: 'Garantia da Qualidade', email: 'testador.gq@teste.msbbrasil.com',       perfil: 'GQ Administrador',       licenca: 'Manager', cor: '#2d5be3', senha: SENHA_TESTE_HASH },
  { nome: 'Testador Analista', iniciais: 'TA', cargo: 'Conta de teste — Analista GQ',            area: 'Garantia da Qualidade', email: 'testador.analista@teste.msbbrasil.com', perfil: 'GQ Analista',            licenca: 'Manager', cor: '#00897b', senha: SENHA_TESTE_HASH },
  { nome: 'Testador Área',     iniciais: 'TC', cargo: 'Conta de teste — Controle da Qualidade',  area: 'Controle da Qualidade', email: 'testador.area@teste.msbbrasil.com',     perfil: 'Controle da Qualidade', licenca: 'Manager', cor: '#7c3aed', senha: SENHA_TESTE_HASH },
];

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  try {
    const rows = await sql(`SELECT COUNT(*)::int AS n FROM sgq_records WHERE collection = 'equipe'`);
    const n = rows[0]?.n ?? 0;
    if (n > 0) {
      return res.status(200).json({ skipped: true, existing: n, message: 'Equipe já populada; nada a fazer.' });
    }
    let inseridas = 0;
    for (const c of CONTAS) {
      await sql(`INSERT INTO sgq_records (collection, data) VALUES ('equipe', $1)`, [JSON.stringify(c)]);
      inseridas++;
    }
    return res.status(200).json({ ok: true, inseridas, contas: CONTAS.map(c => ({ nome: c.nome, perfil: c.perfil })) });
  } catch (err) {
    console.error('[API] Erro em /seed:', err);
    return res.status(500).json({ error: String(err.message || err) });
  }
};
