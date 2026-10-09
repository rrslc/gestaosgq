/**
 * Seed de CONTAS DE TESTE no Neon — para colegas testarem o QMS e o app de
 * Atividades com login e perfis diferentes.
 *
 * Execução: node scripts/seed-testers.js   (requer DATABASE_URL no ambiente ou .env.local)
 *
 * Todas as contas já vêm com uma SENHA DE TESTE compartilhada (hash SHA-256),
 * então vários testadores podem entrar com a mesma credencial — ideal para um
 * piloto. NÃO use essas contas em produção definitiva.
 *
 *   Senha de teste (todas as contas):  Teste@2026
 *
 * Seguro: não apaga ninguém; insere só quem ainda não existir (dedup por e-mail).
 */

require('dotenv').config({ path: '.env.local' });

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error('Erro: DATABASE_URL não definida. Crie .env.local com a connection string do Neon.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

// SHA-256 de "Teste@2026" (mesmo algoritmo de js/crypto.js — SHA-256 puro).
const SENHA_TESTE_HASH = 'a444aaaffde8a69f3e2e96b2f93d2d8a78f301f385cf9c171b439e8f3f193567';

const TESTADORES = [
  {
    nome: 'Testador GQ', iniciais: 'TG',
    cargo: 'Conta de teste — Garantia da Qualidade',
    area: 'Garantia da Qualidade', email: 'testador.gq@teste.msbbrasil.com',
    perfil: 'GQ Administrador', licenca: 'Manager', cor: '#2d5be3',
    senha: SENHA_TESTE_HASH,
  },
  {
    nome: 'Testador Analista', iniciais: 'TA',
    cargo: 'Conta de teste — Analista GQ',
    area: 'Garantia da Qualidade', email: 'testador.analista@teste.msbbrasil.com',
    perfil: 'GQ Analista', licenca: 'Manager', cor: '#00897b',
    senha: SENHA_TESTE_HASH,
  },
  {
    nome: 'Testador Área', iniciais: 'TC',
    cargo: 'Conta de teste — Controle da Qualidade',
    area: 'Controle da Qualidade', email: 'testador.area@teste.msbbrasil.com',
    perfil: 'Controle da Qualidade', licenca: 'Manager', cor: '#7c3aed',
    senha: SENHA_TESTE_HASH,
  },
];

async function seed() {
  const existing = await sql(
    `SELECT data->>'email' AS email FROM sgq_records WHERE collection = 'equipe'`
  );
  const jaExistem = new Set(existing.map(r => (r.email || '').toLowerCase()).filter(Boolean));

  let inseridas = 0;
  for (const t of TESTADORES) {
    if (jaExistem.has(t.email.toLowerCase())) {
      console.log(`  – ${t.nome} já existe (${t.email}), pulando.`);
      continue;
    }
    await sql(`INSERT INTO sgq_records (collection, data) VALUES ('equipe', $1)`, [JSON.stringify(t)]);
    console.log(`  ✓ ${t.nome} — ${t.perfil}`);
    inseridas++;
  }

  console.log(`\nSeed de testadores concluído: ${inseridas} conta(s) inserida(s).`);
  console.log('Credencial de teste (todas): senha "Teste@2026".');
  console.log('Compartilhe o link + o nome da conta + a senha com os testadores.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Erro durante o seed de testadores:', err.message);
  process.exit(1);
});
