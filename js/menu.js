/**
 * @fileoverview Configuração de menu por aplicativo.
 *
 * O projeto serve DOIS front-ends sobre o MESMO núcleo e a MESMA base de dados:
 *  - 'qms': Sistema de Gestão da Qualidade (processos formais, orientados a POP).
 *  - 'gq' : Atividades do GQ (rotina/planejamento interno da equipe).
 *
 * O app ativo é definido por `window.__APP__` (na entrada HTML) ou por `?app=`
 * na URL; o padrão é 'qms'. A sidebar é gerada a partir daqui, então as duas
 * entradas HTML não duplicam o menu.
 */

export const APP =
  (typeof window !== 'undefined' && window.__APP__) ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('app')) ||
  'qms';

export const MENUS = {
  qms: {
    title: 'SGQ',
    sub: 'Sistema de Gestão da Qualidade',
    home: 'dashboard',
    sections: [
      { title: 'Visão Geral', items: [
        { route: 'dashboard',    icon: '◉', label: 'Dashboard' },
        { route: 'conformidade', icon: '🛡', label: 'Conformidade' },
      ]},
      { title: 'CAPA', items: [
        { route: 'capaGerencial', icon: '📊', label: 'Gerencial' },
        { route: 'capaAbertura',  icon: '📋', label: 'Registro' },
      ]},
      { title: 'RNC', items: [
        { route: 'rncGerencial', icon: '📊', label: 'Gerencial' },
        { route: 'rncAbertura',  icon: '⚑', label: 'Registro' },
      ]},
      { title: 'Gestão de Reclamação', items: [
        { route: 'reclamacoesGerencial', icon: '📊', label: 'Gerencial' },
        { route: 'reclamacoesAbertura',  icon: '📩', label: 'Registro' },
        { route: 'tecnovig',             icon: '⚕', label: 'Tecnovigilância' },
      ]},
      { title: 'Documentos', items: [
        { route: 'documentos', icon: '📄', label: 'Controle de Documentação' },
        { route: 'elaboracao', icon: '✏', label: 'Elaboração de Documentos' },
      ]},
      { title: 'Gestão de Mudanças', items: [
        { route: 'gcmGerencial', icon: '📊', label: 'Gerencial' },
        { route: 'gcmAbertura',  icon: '↻', label: 'Registro' },
      ]},
      { title: 'Auditorias', items: [
        { route: 'auditoriasPlano', icon: '📋', label: 'Plano Anual' },
        { route: 'auditoriasExec',  icon: '📊', label: 'Execução / Achados' },
      ]},
      { title: 'Validações', items: [
        { route: 'validacoes', icon: '✔', label: 'Validações' },
      ]},
      { title: 'Assistência Técnica', items: [
        { route: 'assistenciaTecnica', icon: '🔧', label: 'Assistência Técnica' },
      ]},
      { title: 'Análise de Risco', items: [
        { route: 'risco', icon: '⚠', label: 'Análise de Risco' },
      ]},
      { title: 'Qualificação de Fornecedores', items: [
        { route: 'fornecedores', icon: '⬡', label: 'Cadastro de Fornecedores' },
      ]},
      { title: 'Revisão Gerencial', items: [
        { route: 'revisaoGerencial', icon: '🏛', label: 'Revisão Gerencial' },
      ]},
      { title: 'Sistema', items: [
        { route: 'equipe',        icon: '⚇', label: 'Equipe' },
        { route: 'permissoes',    icon: '🔐', label: 'Permissões' },
        { route: 'trilha',        icon: '📋', label: 'Trilha de Auditoria' },
        { route: 'configuracoes', icon: '⚙', label: 'Configurações' },
      ]},
    ],
  },

  gq: {
    title: 'SGQ · Atividades',
    sub: 'Garantia da Qualidade',
    home: 'atividades',
    sections: [
      { title: 'Visão Geral', items: [
        { route: 'dashboard',   icon: '◉', label: 'Dashboard' },
        { route: 'atividades',  icon: '✅', label: 'Atividades' },
        { route: 'agenda',      icon: '📅', label: 'Agenda GQ' },
        { route: 'calendario',  icon: '▦', label: 'Calendário' },
      ]},
      { title: 'Projetos', items: [
        { route: 'projetosGerencial', icon: '🗂', label: 'Gerencial' },
        { route: 'projetosAbertura',  icon: '📐', label: 'Atividades GQ' },
      ]},
      { title: 'Planejamento', items: [
        { route: 'cronograma', icon: '▤', label: 'Cronograma' },
      ]},
      { title: 'Rotinas da Fábrica', items: [
        { route: 'pragas',           icon: '🐛', label: 'Controle de Pragas' },
        { route: 'reservatorio',     icon: '💧', label: 'Limpeza de Reservatório' },
        { route: 'residuos',         icon: '♻', label: 'Gerenciamento de Resíduos' },
        { route: 'microbiologico',   icon: '🔬', label: 'Monitoramento Microbiológico' },
        { route: 'limpezaMensal',    icon: '🧹', label: 'Limpeza Mensal' },
        { route: 'gembaWalk',        icon: '👣', label: 'Gemba Walk' },
        { route: 'orcamentosAnuais', icon: '📋', label: 'Orçamentos Anuais' },
      ]},
      { title: 'Regulatório', items: [
        { route: 'obrigacoes', icon: '📋', label: 'Obrigações Regulatórias' },
        { route: 'docsAdmin',  icon: '🗂', label: 'Documentos Administrativos' },
      ]},
      { title: 'Sistema', items: [
        { route: 'equipe',        icon: '⚇', label: 'Equipe' },
        { route: 'configuracoes', icon: '⚙', label: 'Configurações' },
      ]},
    ],
  },
};

/** Configuração do app ativo (fallback para 'qms'). */
export function activeMenu() {
  return MENUS[APP] || MENUS.qms;
}

/** Gera o HTML interno da <nav> da sidebar para o app ativo. */
export function renderSidebarNav(menu = activeMenu()) {
  return menu.sections.map(sec => `
    <div class="nav-section">${sec.title}</div>
    ${sec.items.map(it => `
      <a class="nav-item" data-route="${it.route}">
        <span class="nav-icon">${it.icon}</span>
        <span class="nav-label">${it.label}</span>
      </a>`).join('')}
  `).join('');
}
