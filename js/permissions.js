/**
 * @fileoverview Modelo central de permissões — perfis reais MSB Brasil.
 *
 * Perfis (mapeados às áreas reais da empresa):
 *   GQ Administrador   — coordenação GQ; acesso total + sistema
 *   GQ Analista        — analistas GQ/AR; todos os módulos exceto Sistema/Planejamento Est.
 *   Controle da Qualidade — Assistente, Inspetor, Supervisora de CQ
 *   Engenharia         — Analista, Coordenador, Estagiário de Engenharia
 *   Produção           — Auxiliar, Supervisora de Produção
 *   Industrial         — Gerente Industrial
 *   Manutenção         — Técnico, Líder de Manutenção
 *   Planejamento       — Analista e Assistente de Planejamento
 *   Logística          — Assistente Logístico
 *   Comercial          — KAM, Assistente Comercial, Operações de Vendas, Vendas
 *   Diretoria          — CEO, Diretor Industrial
 *   Administrativo     — Administrativo, Contábil, Financeiro, RH, TI
 *
 * Níveis de acesso:
 *   Gestão (3) — criar, editar, excluir, avançar fluxo
 *   Exec.  (2) — registrar / preencher registros próprios (create + edit)
 *   Ver    (1) — somente leitura
 *   —      (0) — sem acesso
 */

// ── Ações ─────────────────────────────────────────────────────────────────────
export const A = {
  VIEW:    'view',
  CREATE:  'create',
  EDIT:    'edit',
  ADVANCE: 'advance',
  DELETE:  'delete',
  MANAGE:  'manage',
};

// ── Perfis exportados (usados pelo módulo Equipe) ─────────────────────────────
export const PERFIS = [
  'GQ Administrador',
  'GQ Analista',
  'Controle da Qualidade',
  'Engenharia',
  'Produção',
  'Industrial',
  'Manutenção',
  'Planejamento',
  'Logística',
  'Comercial',
  'Diretoria',
  'Administrativo',
];

export const LICENCAS = ['Manager', 'View'];

// ── Internos ──────────────────────────────────────────────────────────────────

// Aliases curtos para os nomes de perfil (evitam repetição na tabela)
const P = {
  ADM:  'GQ Administrador',
  GQA:  'GQ Analista',
  CQ:   'Controle da Qualidade',
  ENG:  'Engenharia',
  PROD: 'Produção',
  INDU: 'Industrial',
  MANU: 'Manutenção',
  PLAN: 'Planejamento',
  LOG:  'Logística',
  COM:  'Comercial',
  DIR:  'Diretoria',
  ADMI: 'Administrativo',
};

// Nível de acesso numérico
const L = { NONE: 0, VIEW: 1, EXEC: 2, MANAGE: 3 };

// Ação → nível mínimo exigido
const ACAO_NIVEL = {
  [A.VIEW]:    L.VIEW,
  [A.CREATE]:  L.EXEC,
  [A.EDIT]:    L.EXEC,
  [A.ADVANCE]: L.MANAGE,
  [A.DELETE]:  L.MANAGE,
  [A.MANAGE]:  L.MANAGE,
};

// ── Tabela de permissões por rota ─────────────────────────────────────────────
// Perfis ausentes numa entrada têm nível 0 (sem acesso).
const PERM = {

  // ── Visão Geral ─────────────────────────────────────────────────────────────
  dashboard: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PLAN]: L.VIEW, [P.LOG]: L.VIEW,
    [P.COM]: L.VIEW, [P.DIR]: L.VIEW, [P.ADMI]: L.VIEW,
  },

  // ── Gestão interna GQ ───────────────────────────────────────────────────────
  atividades:        { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  agenda:            { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  calendario:        { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  projetosGerencial: { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  projetosAbertura:  { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  revisaoGerencial:  { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  cronograma:        { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  gembaWalk:         { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  orcamentosAnuais:  { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },

  // ── Dashboards (gerenciais) ─────────────────────────────────────────────────
  capaGerencial: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PLAN]: L.VIEW,
  },
  rncGerencial: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PLAN]: L.VIEW,
  },
  gcmGerencial: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PLAN]: L.VIEW,
  },

  // ── Processos SGQ — todas as áreas podem abrir ──────────────────────────────
  rncAbertura: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.ENG]: L.EXEC, [P.PROD]: L.EXEC, [P.INDU]: L.EXEC,
    [P.MANU]: L.EXEC, [P.PLAN]: L.EXEC, [P.LOG]: L.EXEC,
    [P.COM]: L.EXEC, [P.DIR]: L.EXEC, [P.ADMI]: L.EXEC,
  },
  capaAbertura: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.ENG]: L.EXEC, [P.PROD]: L.EXEC, [P.INDU]: L.EXEC,
    [P.MANU]: L.EXEC, [P.PLAN]: L.EXEC, [P.LOG]: L.EXEC,
    [P.COM]: L.EXEC, [P.DIR]: L.EXEC, [P.ADMI]: L.EXEC,
  },
  gcmAbertura: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.ENG]: L.EXEC, [P.PROD]: L.EXEC, [P.INDU]: L.EXEC,
    [P.MANU]: L.EXEC, [P.PLAN]: L.EXEC, [P.LOG]: L.EXEC,
    [P.COM]: L.EXEC, [P.DIR]: L.EXEC, [P.ADMI]: L.EXEC,
  },
  elaboracao: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.ENG]: L.EXEC, [P.PROD]: L.EXEC, [P.INDU]: L.EXEC,
    [P.MANU]: L.EXEC, [P.PLAN]: L.EXEC, [P.LOG]: L.EXEC,
    [P.COM]: L.EXEC, [P.DIR]: L.EXEC, [P.ADMI]: L.EXEC,
  },

  // ── Auditorias ──────────────────────────────────────────────────────────────
  auditoriasPlano: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW, [P.MANU]: L.VIEW,
  },
  auditoriasExec: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW, [P.MANU]: L.VIEW,
  },

  // ── Análise de Risco ────────────────────────────────────────────────────────
  risco: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW,
  },

  // ── Documentos ──────────────────────────────────────────────────────────────
  documentos: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.PROD]: L.VIEW, [P.INDU]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PLAN]: L.VIEW, [P.LOG]: L.VIEW,
    [P.COM]: L.VIEW, [P.DIR]: L.VIEW, [P.ADMI]: L.VIEW,
  },

  // ── Assuntos Regulatórios ───────────────────────────────────────────────────
  obrigacoes: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.ENG]: L.VIEW, [P.COM]: L.VIEW,
  },
  docsAdmin:            { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  reclamacoesGerencial: { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  reclamacoesAbertura:  { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  tecnovig:             { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },

  // ── Fábrica ─────────────────────────────────────────────────────────────────
  pragas: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.INDU]: L.VIEW, [P.MANU]: L.EXEC,
  },
  reservatorio: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.INDU]: L.VIEW, [P.MANU]: L.EXEC,
  },
  residuos: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.INDU]: L.VIEW, [P.MANU]: L.EXEC,
  },
  microbiologico: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.PROD]: L.EXEC,
  },
  limpezaMensal: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.INDU]: L.VIEW, [P.MANU]: L.EXEC,
  },

  // ── Técnico especializado ───────────────────────────────────────────────────
  validacoes: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.ENG]: L.EXEC,
  },
  assistenciaTecnica: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.MANU]: L.EXEC,
  },
  fornecedores: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.LOG]: L.VIEW, [P.ENG]: L.VIEW,
  },

  // ── Sistema ─────────────────────────────────────────────────────────────────
  equipe:        { [P.ADM]: L.MANAGE, [P.GQA]: L.VIEW },
  permissoes:    { [P.ADM]: L.MANAGE },
  configuracoes: { [P.ADM]: L.MANAGE },
  trilha:        { [P.ADM]: L.MANAGE, [P.GQA]: L.VIEW },
};

// Rotas de redirecionamento → resolve para o gerencial correspondente
const ALIAS = {
  capa:        'capaGerencial',
  rnc:         'rncGerencial',
  gcm:         'gcmGerencial',
  reclamacoes: 'reclamacoesGerencial',
  auditorias:  'auditoriasPlano',
  projetos:    'projetosGerencial',
};

// ── API pública ───────────────────────────────────────────────────────────────

/**
 * Verifica se a sessão pode executar uma ação em um módulo.
 * @param {Object|null} session — resultado de getSession()
 * @param {string}      modulo  — chave da rota (ex: 'rncAbertura', 'dashboard')
 * @param {string}      [acao]  — constante de A (padrão: A.VIEW)
 * @returns {boolean}
 */
export function can(session, modulo, acao = A.VIEW) {
  if (!session) return false;

  const rota = ALIAS[modulo] ?? modulo;
  const moduloPerm = PERM[rota];

  // Módulo não mapeado: somente GQ Administrador
  if (!moduloPerm) return session.perfil === P.ADM;

  const nivel = moduloPerm[session.perfil] ?? L.NONE;
  const nivelRequerido = ACAO_NIVEL[acao] ?? L.VIEW;
  return nivel >= nivelRequerido;
}

/** Atalho: pode criar / editar neste módulo? */
export function canWrite(session, modulo) {
  return can(session, modulo, A.EDIT);
}
