/**
 * Seed script — cadastra as colaboradoras da Garantia da Qualidade no Neon.
 * Execução: node scripts/seed-equipe.js
 * Requer DATABASE_URL definida no ambiente ou em .env.local
 *
 * Estratégia segura:
 *  - NÃO apaga a equipe existente (não pode zerar usuários/senhas em produção).
 *  - Insere apenas quem ainda não estiver no banco (comparação por e-mail).
 *  - Cadastra SEM senha, para o fluxo de "primeiro acesso" do portal permitir
 *    que a Coordenadora crie a senha inicial. As demais senhas são provisionadas
 *    depois em Sistema → Equipe.
 */

require('dotenv').config({ path: '.env.local' });

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error('Erro: DATABASE_URL não definida. Crie .env.local com a connection string do Neon.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const EQUIPE = [
  {
    nome: 'Raissa Rayane Santos Laurindo Caldas',
    iniciais: 'RC',
    cargo: 'Coordenadora da Garantia da Qualidade e Assuntos Regulatórios',
    area: 'Garantia da Qualidade',
    email: 'raissa.caldas@msbbrasil.com',
    perfil: 'GQ Administrador',
    licenca: 'Manager',
    cor: '#2d5be3',
  },
  {
    nome: 'Juliana Ranzan Matos',
    iniciais: 'JM',
    cargo: 'Analista da Garantia da Qualidade e Assuntos Regulatórios',
    area: 'Garantia da Qualidade',
    email: 'juliana.matos@msbbrasil.com',
    perfil: 'GQ Analista',
    licenca: 'Manager',
    cor: '#00897b',
  },
  {
    nome: 'Maria Luiza dos Santos Rodrigues Matos',
    iniciais: 'ML',
    cargo: 'Analista da Garantia da Qualidade e Assuntos Regulatórios',
    area: 'Garantia da Qualidade',
    email: 'maria.matos@msbbrasil.com',
    perfil: 'GQ Analista',
    licenca: 'Manager',
    cor: '#7c3aed',
  },
];

async function seed() {
  const existing = await sql(
    `SELECT data->>'email' AS email FROM sgq_records WHERE collection = 'equipe'`
  );
  const jaExistem = new Set(existing.map(r => (r.email || '').toLowerCase()).filter(Boolean));

  let inseridas = 0;
  for (const membro of EQUIPE) {
    if (jaExistem.has(membro.email.toLowerCase())) {
      console.log(`  – ${membro.nome} já cadastrada (${membro.email}), pulando.`);
      continue;
    }
    await sql(
      `INSERT INTO sgq_records (collection, data) VALUES ('equipe', $1)`,
      [JSON.stringify(membro)]
    );
    console.log(`  ✓ ${membro.nome} — ${membro.perfil}`);
    inseridas++;
  }

  console.log(`\nSeed concluído: ${inseridas} colaboradora(s) inserida(s), ${EQUIPE.length - inseridas} já existente(s).`);
  console.log('Próximo passo: a Coordenadora acessa o portal, escolhe o nome e cria a senha (primeiro acesso).');
  process.exit(0);
}

seed().catch(err => {
  console.error('Erro durante o seed:', err.message);
  process.exit(1);
});
