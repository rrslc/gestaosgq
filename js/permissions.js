/**
 * @fileoverview Modelo central de permissões.
 *
 * Licenças:
 *   Manager — pode criar, editar, avançar, gerenciar
 *   View    — somente leitura
 *
 * Perfis:
 *   Adm       — Coordenadora GQ + TI; acesso total
 *   GQ Apoio  — Analistas GQ/AR; todos os módulos GQ com Manager
 *   Executor  — Demais colaboradoras; módulos específicos
 */

export const LICENCAS = ['Manager', 'View'];
export const PERFIS   = ['Adm', 'GQ Apoio', 'Executor'];

// Ações
export const A = {
  VIEW:    'view',
  CREATE:  'create',
  EDIT:    'edit',
  ADVANCE: 'advance',
  DELETE:  'delete',
  MANAGE:  'manage',
};

// Módulos que Executores podem acessar
const EXECUTOR_ACCESS = new Set([
  'dashboard',
  'auditorias',
  'documentos',
  'elaboracao',
  'risco',
  'configuracoes',
  'atividades',
  // Solicitações — apenas abrir (create/view); o avanço fica com GQ
  'capa',
  'rnc',
  'reclamacoes',
  'tecnovig',
]);

// Ações que Executores NUNCA fazem, mesmo com Manager, nos módulos de solicitação
const EXECUTOR_BLOCKED_ACTIONS = new Set([A.ADVANCE, A.DELETE, A.MANAGE]);

/**
 * Verifica se a sessão tem permissão para executar uma ação em um módulo.
 *
 * @param {Object|null} session  — resultado de getSession()
 * @param {string}      modulo   — chave do módulo (ex: 'rnc', 'capa')
 * @param {string}      [acao]   — ação desejada (padrão: 'view')
 * @returns {boolean}
 */
export function can(session, modulo, acao = A.VIEW) {
  if (!session) return false;

  // Adm: acesso total
  if (session.perfil === 'Adm') return true;

  const isWrite = acao !== A.VIEW;

  // GQ Apoio: acesso a todos os módulos; escrita requer Manager
  if (session.perfil === 'GQ Apoio') {
    return isWrite ? session.licenca === 'Manager' : true;
  }

  // Executor: acesso restrito por módulo e ação
  if (session.perfil === 'Executor') {
    if (!EXECUTOR_ACCESS.has(modulo)) return false;
    if (!isWrite) return true;
    if (session.licenca !== 'Manager') return false;
    // Em módulos de solicitação, Executores só podem criar/editar (não avançar/excluir/gerir)
    const isSolicitacao = ['capa', 'rnc', 'reclamacoes', 'tecnovig'].includes(modulo);
    if (isSolicitacao && EXECUTOR_BLOCKED_ACTIONS.has(acao)) return false;
    return true;
  }

  return false;
}

/** Atalho: pode escrever (create ou edit) neste módulo? */
export function canWrite(session, modulo) {
  return can(session, modulo, A.EDIT);
}
