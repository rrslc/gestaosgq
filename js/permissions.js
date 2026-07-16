/**
 * @fileoverview Modelo central de permissões — 11 perfis por área MSB Brasil.
 *
 * Perfis (um por área):
 *   GQ Administrador   — coordenação GQ; acesso total + sistema
 *   GQ Analista        — analistas GQ/AR; todos os módulos GQ
 *   Controle de Qualidade, Melhoria Contínua, Produção, Manutenção,
 *   PCP, Logística, Engenharia, Comercial, Gente e Gestão
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
  'Controle de Qualidade',
  'Melhoria Contínua',
  'Produção',
  'Manutenção',
  'PCP',
  'Logística',
  'Engenharia',
  'Comercial',
  'Gente e Gestão',
];

export const LICENCAS = ['Manager', 'View'];

// ── Internos ──────────────────────────────────────────────────────────────────

// Aliases curtos para os nomes de perfil (evitam repetição na tabela)
const P = {
  ADM:  'GQ Administrador',
  GQA:  'GQ Analista',
  CQ:   'Controle de Qualidade',
  MC:   'Melhoria Contínua',
  PROD: 'Produção',
  MANU: 'Manutenção',
  PCP:  'PCP',
  LOG:  'Logística',
  ENG:  'Engenharia',
  COM:  'Comercial',
  GG:   'Gente e Gestão',
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
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW, [P.MANU]: L.VIEW,
    [P.PCP]: L.VIEW, [P.LOG]: L.VIEW, [P.ENG]: L.VIEW, [P.COM]: L.VIEW, [P.GG]: L.VIEW,
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
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PCP]: L.VIEW, [P.ENG]: L.VIEW,
  },
  rncGerencial: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PCP]: L.VIEW, [P.ENG]: L.VIEW,
  },
  gcmGerencial: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW,
    [P.MANU]: L.VIEW, [P.PCP]: L.VIEW, [P.ENG]: L.VIEW,
  },

  // ── Processos SGQ — todas as áreas podem abrir ──────────────────────────────
  rncAbertura: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.MC]: L.EXEC, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
    [P.PCP]: L.EXEC, [P.LOG]: L.EXEC, [P.ENG]: L.EXEC, [P.COM]: L.EXEC, [P.GG]: L.EXEC,
  },
  capaAbertura: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.MC]: L.EXEC, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
    [P.PCP]: L.EXEC, [P.LOG]: L.EXEC, [P.ENG]: L.EXEC, [P.COM]: L.EXEC, [P.GG]: L.EXEC,
  },
  gcmAbertura: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.MC]: L.EXEC, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
    [P.PCP]: L.EXEC, [P.LOG]: L.EXEC, [P.ENG]: L.EXEC, [P.COM]: L.EXEC, [P.GG]: L.EXEC,
  },
  elaboracao: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.MC]: L.EXEC, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
    [P.PCP]: L.EXEC, [P.LOG]: L.EXEC, [P.ENG]: L.EXEC, [P.COM]: L.EXEC, [P.GG]: L.EXEC,
  },

  // ── Auditorias ──────────────────────────────────────────────────────────────
  auditoriasPlano: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW, [P.MANU]: L.VIEW, [P.ENG]: L.VIEW,
  },
  auditoriasExec: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW, [P.MANU]: L.VIEW, [P.ENG]: L.VIEW,
  },

  // ── Análise de Risco ────────────────────────────────────────────────────────
  risco: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.ENG]: L.VIEW,
  },

  // ── Documentos ──────────────────────────────────────────────────────────────
  documentos: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.PROD]: L.VIEW, [P.MANU]: L.VIEW,
    [P.PCP]: L.VIEW, [P.LOG]: L.VIEW, [P.ENG]: L.VIEW, [P.COM]: L.VIEW, [P.GG]: L.VIEW,
  },

  // ── Assuntos Regulatórios ───────────────────────────────────────────────────
  obrigacoes: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.MC]: L.VIEW, [P.ENG]: L.VIEW, [P.COM]: L.VIEW,
  },
  docsAdmin:            { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  reclamacoesGerencial: { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  reclamacoesAbertura:  { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },
  tecnovig:             { [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE },

  // ── Fábrica ─────────────────────────────────────────────────────────────────
  pragas: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
  },
  reservatorio: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
  },
  residuos: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
  },
  microbiologico: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.PROD]: L.EXEC,
  },
  limpezaMensal: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.VIEW, [P.PROD]: L.EXEC, [P.MANU]: L.EXEC,
  },

  // ── Técnico especializado ───────────────────────────────────────────────────
  validacoes: {
    [P.ADM]: L.MANAGE, [P.GQA]: L.MANAGE,
    [P.CQ]: L.EXEC, [P.MC]: L.EXEC, [P.ENG]: L.EXEC,
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
