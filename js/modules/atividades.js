/**
 * @fileoverview Atividades — planejamento e acompanhamento da equipe GQ.
 * Inclui catálogo de atividades obrigatórias derivadas dos procedimentos do SGQ.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { getSession } from '../session.js';
import { can, A } from '../permissions.js';

const TIPOS = ['Treinamento', 'Monitoramento', 'Auditoria Interna', 'Análise', 'Regulatório', 'Reunião', 'Elaboração', 'Revisão', 'Outro'];
const STATUS_LIST = ['Planejada', 'Em Andamento', 'Concluída', 'Cancelada'];
const STATUS_DONE = new Set(['Concluída', 'Cancelada']);
const PRIORIDADES = ['Alta', 'Média', 'Baixa'];
const PRIO_COR   = { Alta: 'var(--red,#ef4444)', Média: 'var(--amber,#f59e0b)', Baixa: 'var(--blue,#3b82f6)' };
const PRIO_ORDER = { Alta: 0, Média: 1, Baixa: 2 };
const PERI_COR   = {
  'Mensal':      '#2563eb',
  'Trimestral':  '#0d9488',
  'Semestral':   '#7c3aed',
  'Anual':       '#d97706',
  'Sob demanda': '#64748b',
};

function nextDate(fromISO, periodicidade) {
  if (!fromISO) return null;
  const d = new Date(fromISO + 'T00:00:00');
  switch (periodicidade) {
    case 'Mensal':      d.setMonth(d.getMonth() + 1);        break;
    case 'Bimestral':   d.setMonth(d.getMonth() + 2);        break;
    case 'Trimestral':  d.setMonth(d.getMonth() + 3);        break;
    case 'Semestral':   d.setMonth(d.getMonth() + 6);        break;
    case 'Anual':       d.setFullYear(d.getFullYear() + 1);  break;
    default: return null;
  }
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, dd] = iso.split('-');
  return `${dd}/${m}/${y}`;
}

// ── Catálogo de atividades obrigatórias ──────────────────────────────────────

const CATALOGO = [
  // ── Gestão de Documentos ──────────────────────────────────────────────────
  {
    id: 'DOC-01', categoria: 'Gestão de Documentos',
    titulo: 'Verificação de vigência de documentos externos',
    tipo: 'Análise', periodicidade: 'Trimestral', prioridade: 'Alta',
    referencia: 'POP-GQ-003 §7.6.1',
    descricao: 'Verificar a vigência de normas, portarias e regulamentações externas aplicáveis ao SGQ.',
  },
  {
    id: 'DOC-02', categoria: 'Gestão de Documentos',
    titulo: 'Verificação e atualização do Cartão de Assinaturas',
    tipo: 'Revisão', periodicidade: 'Anual', prioridade: 'Média',
    referencia: 'POP-GQ-003 §7.10',
    descricao: 'Verificar e atualizar as assinaturas e rubricas de todos os colaboradores no Cartão de Assinaturas.',
  },
  {
    id: 'DOC-03', categoria: 'Gestão de Documentos',
    titulo: 'Revisão e atualização da Lista Mestra de Documentos',
    tipo: 'Revisão', periodicidade: 'Semestral', prioridade: 'Média',
    referencia: 'POP-GQ-003',
    descricao: 'Verificar e atualizar a Lista Mestra de Documentos vigentes do SGQ, garantindo que revisões e cancelamentos estejam refletidos.',
  },
  {
    id: 'DOC-04', categoria: 'Gestão de Documentos',
    titulo: 'Verificação de documentos obsoletos em circulação',
    tipo: 'Revisão', periodicidade: 'Semestral', prioridade: 'Baixa',
    referencia: 'POP-GQ-003 §7.9',
    descricao: 'Verificar e recolher cópias controladas de documentos obsoletos ainda em uso nas áreas.',
  },
  {
    id: 'DOC-05', categoria: 'Gestão de Documentos',
    titulo: 'Preparação e homologação de documentos revisados',
    tipo: 'Elaboração', periodicidade: 'Sob demanda', prioridade: 'Alta',
    referencia: 'POP-GQ-002',
    descricao: 'Conduzir o fluxo de elaboração, revisão, aprovação e homologação de documentos do SGQ conforme ciclo de revisão.',
  },

  // ── Monitoramento e Análise ───────────────────────────────────────────────
  {
    id: 'MON-01', categoria: 'Monitoramento e Análise',
    titulo: 'Análise de indicadores de qualidade do SGQ',
    tipo: 'Análise', periodicidade: 'Mensal', prioridade: 'Alta',
    referencia: 'ISO 13485 §8.4',
    descricao: 'Consolidar e analisar os indicadores de qualidade do período: NCs abertas, CAPAs em andamento, reclamações recebidas, devoluções, índice de rejeição de lote.',
  },
  {
    id: 'MON-02', categoria: 'Monitoramento e Análise',
    titulo: 'Análise de tendências de NCs e reclamações',
    tipo: 'Análise', periodicidade: 'Trimestral', prioridade: 'Alta',
    referencia: 'ISO 13485 §8.4 / RDC 665/2022',
    descricao: 'Analisar tendências de não-conformidades, reclamações de clientes e queixas técnicas para identificar padrões e acionar ações proativas.',
  },
  {
    id: 'MON-03', categoria: 'Monitoramento e Análise',
    titulo: 'Verificação de CAPAs e RNCs com prazo vencido',
    tipo: 'Análise', periodicidade: 'Mensal', prioridade: 'Alta',
    referencia: 'ISO 13485 §8.5.2',
    descricao: 'Verificar CAPAs e RNCs com prazo de conclusão ultrapassado, escalar e registrar justificativa de prorrogação quando necessário.',
  },
  {
    id: 'MON-04', categoria: 'Monitoramento e Análise',
    titulo: 'Avaliação de desempenho de fornecedores críticos',
    tipo: 'Análise', periodicidade: 'Semestral', prioridade: 'Média',
    referencia: 'POP-GQ-007 §6.2',
    descricao: 'Avaliar pontualidade, qualidade de entrega, conformidade de produto e atendimento dos fornecedores críticos e maiores.',
  },
  {
    id: 'MON-05', categoria: 'Monitoramento e Análise',
    titulo: 'Elaboração do Relatório de Desempenho do SGQ',
    tipo: 'Elaboração', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'ISO 13485 §9.3',
    descricao: 'Compilar todos os inputs obrigatórios para a Análise Crítica pela Direção: auditorias, CAPA, reclamações, objetivos da qualidade, desempenho de fornecedores, adequação de recursos.',
  },

  {
    id: 'MON-06', categoria: 'Monitoramento e Análise',
    titulo: 'Análise de ficha de retrabalho',
    tipo: 'Análise', periodicidade: 'Mensal', prioridade: 'Alta',
    referencia: 'ISO 13485 §8.3',
    descricao: 'Análise das fichas de retrabalho emitidas no período: causas raiz, lotes afetados, conformidade do produto reprocessado e necessidade de abertura de RNC ou CAPA.',
  },

  // ── Treinamento e Competência ─────────────────────────────────────────────
  {
    id: 'TRN-01', categoria: 'Treinamento e Competência',
    titulo: 'Reciclagem de treinamentos obrigatórios SGQ',
    tipo: 'Treinamento', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'POP-RH-002',
    descricao: 'Reciclagem anual em RDC 665/2022, ISO 13485, BPF, controle de documentos e procedimentos críticos do SGQ.',
  },
  {
    id: 'TRN-02', categoria: 'Treinamento e Competência',
    titulo: 'Revisão e atualização do Plano de Treinamento Anual',
    tipo: 'Revisão', periodicidade: 'Anual', prioridade: 'Média',
    referencia: 'POP-RH-002 / ISO 13485 §6.2',
    descricao: 'Revisar e atualizar o Plano de Treinamento para o exercício seguinte, cobrindo todas as áreas e funções críticas.',
  },
  {
    id: 'TRN-03', categoria: 'Treinamento e Competência',
    titulo: 'Treinamento em documentos revisados',
    tipo: 'Treinamento', periodicidade: 'Sob demanda', prioridade: 'Alta',
    referencia: 'POP-GQ-002',
    descricao: 'Treinamento das equipes afetadas após revisão e homologação de procedimentos e instruções de trabalho.',
  },
  {
    id: 'TRN-04', categoria: 'Treinamento e Competência',
    titulo: 'Verificação de qualificação de auditores internos',
    tipo: 'Análise', periodicidade: 'Anual', prioridade: 'Média',
    referencia: 'POP-GQ-020 / ISO 13485 §9.2',
    descricao: 'Verificar a qualificação e atualização dos auditores internos credenciados para o ciclo de auditoria do exercício.',
  },

  // ── Calibração e Manutenção ───────────────────────────────────────────────
  {
    id: 'CAL-01', categoria: 'Calibração e Manutenção',
    titulo: 'Calibração de equipamentos críticos de CQ',
    tipo: 'Monitoramento', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'ISO 13485 §7.6 / POP-GQ-019',
    descricao: 'Calibração anual dos equipamentos de medição e monitoramento críticos por laboratório acreditado pela REDE RBMLQ-I/INMETRO.',
  },
  {
    id: 'CAL-02', categoria: 'Calibração e Manutenção',
    titulo: 'Manutenção preventiva de equipamentos de produção e CQ',
    tipo: 'Monitoramento', periodicidade: 'Semestral', prioridade: 'Alta',
    referencia: 'ISO 13485 §6.4 / POP-GQ-019',
    descricao: 'Execução do plano semestral de manutenção preventiva dos equipamentos críticos conforme cronograma do PMV.',
  },
  {
    id: 'CAL-03', categoria: 'Calibração e Manutenção',
    titulo: 'Verificação do plano de calibração — próximos vencimentos',
    tipo: 'Análise', periodicidade: 'Trimestral', prioridade: 'Média',
    referencia: 'ISO 13485 §7.6 / POP-GQ-019',
    descricao: 'Identificar equipamentos com calibração vencida ou a vencer no próximo trimestre e acionar o laboratório.',
  },

  // ── Auditorias e Análise Crítica ──────────────────────────────────────────
  {
    id: 'AUD-01', categoria: 'Auditorias e Análise Crítica',
    titulo: 'Elaboração do Programa Anual de Auditorias Internas',
    tipo: 'Elaboração', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'POP-GQ-020 / ISO 13485 §9.2',
    descricao: 'Elaborar ou revisar o programa anual de auditorias internas do SGQ, definindo escopo, processos auditados, datas e auditores.',
  },
  {
    id: 'AUD-02', categoria: 'Auditorias e Análise Crítica',
    titulo: 'Análise Crítica pela Direção — realização',
    tipo: 'Reunião', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'ISO 13485 §9.3 / OBR-2026-006',
    descricao: 'Realizar a reunião de Análise Crítica pela Direção e registrar em ata as decisões e ações de melhoria do SGQ.',
  },
  {
    id: 'AUD-03', categoria: 'Auditorias e Análise Crítica',
    titulo: 'Follow-up de achados de auditoria interna',
    tipo: 'Análise', periodicidade: 'Sob demanda', prioridade: 'Alta',
    referencia: 'POP-GQ-020 / ISO 13485 §9.2',
    descricao: 'Verificar o status das ações corretivas abertas a partir dos achados da última auditoria interna realizada.',
  },
  {
    id: 'AUD-04', categoria: 'Auditorias e Análise Crítica',
    titulo: 'Preparação para inspeção regulatória (ANVISA / CBPF)',
    tipo: 'Análise', periodicidade: 'Sob demanda', prioridade: 'Alta',
    referencia: 'RDC 665/2022 / ISO 13485',
    descricao: 'Preparar dossiê, atualizar Lista Mestra, verificar CAPAs abertas e treinar equipe para inspeção da ANVISA.',
  },

  // ── Regulatório ───────────────────────────────────────────────────────────
  {
    id: 'REG-01', categoria: 'Regulatório',
    titulo: 'Envio MAPA à Polícia Federal (Siproquim2)',
    tipo: 'Regulatório', periodicidade: 'Mensal', prioridade: 'Alta',
    referencia: 'OBR-2026-001 / Port. 344/1998',
    descricao: 'Mapa de controle de substâncias sujeitas a controle especial — envio até o dia 10 do mês subsequente via Siproquim2.',
  },
  {
    id: 'REG-02', categoria: 'Regulatório',
    titulo: 'Relatório Semestral de Tecnovigilância (ANVISA)',
    tipo: 'Regulatório', periodicidade: 'Semestral', prioridade: 'Alta',
    referencia: 'OBR-2026-002 / RDC 67/2009',
    descricao: 'Relatório periódico de tecnovigilância para produtos com registro ativo, enviado via NOTIVISA.',
  },
  {
    id: 'REG-03', categoria: 'Regulatório',
    titulo: 'Relatório Anual de Atividade de Produto — RAP',
    tipo: 'Regulatório', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'OBR-2026-008 / RDC 665/2022',
    descricao: 'Relatório anual de atividade de produto e vigilância pós-mercado enviado via SOLICITA, até 31 de março.',
  },
  {
    id: 'REG-04', categoria: 'Regulatório',
    titulo: 'Verificação e renovação de licenças e documentos regulatórios',
    tipo: 'Regulatório', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'OBR-2026-003/005/009 / ANVISA',
    descricao: 'Monitorar vencimentos e protocolar renovações de AFE, CLF, CBPF, Alvará Sanitário e demais licenças conforme cronograma.',
  },

  {
    id: 'VAL-05', categoria: 'Validações e Qualificações',
    titulo: 'Envio de Amostras — Estudo de Estabilidade (por produto)',
    tipo: 'Monitoramento', periodicidade: 'Sob demanda', prioridade: 'Alta',
    referencia: 'RE 1.235/2004 / ISO 13485 §7.5.6',
    descricao: 'Ao planejar: especificar o produto, lote e ponto do estudo (T0, T3, T6, T12…). Registrar quantidade de amostras, condições de conservação, laboratório receptor e data-limite de entrega conforme protocolo do produto específico.',
  },

  // ── Fábrica ───────────────────────────────────────────────────────────────
  {
    id: 'FAB-01', categoria: 'Fábrica',
    titulo: 'Controle de Pragas',
    tipo: 'Monitoramento', periodicidade: 'Trimestral', prioridade: 'Alta',
    referencia: 'POP-FAB-001',
    descricao: 'Monitoramento e controle de pragas urbanas conforme contrato com empresa especializada. Registro de visitas, relatórios e ações corretivas.',
    route: 'pragas',
  },
  {
    id: 'FAB-02', categoria: 'Fábrica',
    titulo: 'Limpeza de Reservatório',
    tipo: 'Monitoramento', periodicidade: 'Semestral', prioridade: 'Alta',
    referencia: 'POP-FAB-002',
    descricao: 'Limpeza e higienização dos reservatórios de água da unidade conforme periodicidade regulatória. Registro de execução e laudos.',
    route: 'reservatorio',
  },
  {
    id: 'FAB-03', categoria: 'Fábrica',
    titulo: 'Gerenciamento de Resíduos',
    tipo: 'Monitoramento', periodicidade: 'Mensal', prioridade: 'Alta',
    referencia: 'POP-FAB-003',
    descricao: 'Controle e destinação de resíduos sólidos, líquidos e perigosos conforme PGRSS e legislação ambiental vigente.',
    route: 'residuos',
  },
  {
    id: 'FAB-04', categoria: 'Fábrica',
    titulo: 'Monitoramento Microbiológico',
    tipo: 'Monitoramento', periodicidade: 'Mensal', prioridade: 'Alta',
    referencia: 'POP-FAB-004',
    descricao: 'Monitoramento microbiológico de ambientes controlados, água purificada e superfícies. Coleta de amostras e análise de resultados.',
    route: 'microbiologico',
  },
  {
    id: 'FAB-05', categoria: 'Fábrica',
    titulo: 'Limpeza Mensal',
    tipo: 'Monitoramento', periodicidade: 'Mensal', prioridade: 'Média',
    referencia: 'POP-FAB-005',
    descricao: 'Registro e verificação da execução da limpeza profunda mensal das instalações fabris conforme cronograma e checklist de sanitização.',
    route: 'limpezaMensal',
  },
  {
    id: 'FAB-06', categoria: 'Fábrica',
    titulo: 'Gemba Walk',
    tipo: 'Monitoramento', periodicidade: 'Mensal', prioridade: 'Média',
    referencia: 'POP-FAB-006',
    descricao: 'Ronda estruturada no chão de fábrica para identificar desvios, oportunidades de melhoria e verificar condições de BPF e segurança.',
    route: 'gembaWalk',
  },

  // ── Validações e Qualificações ────────────────────────────────────────────
  {
    id: 'VAL-01', categoria: 'Validações e Qualificações',
    titulo: 'Revisão do Plano Mestre de Validação (PMV)',
    tipo: 'Revisão', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'PL-GQ-005 / ISO 13485 §7.5.6',
    descricao: 'Revisar o Plano Mestre de Validação, atualizar status de cada validação/qualificação e replanejar atividades do próximo exercício.',
  },
  {
    id: 'VAL-02', categoria: 'Validações e Qualificações',
    titulo: 'Revisão periódica de validações de processos produtivos',
    tipo: 'Revisão', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'PL-GQ-005 / ISO 13485 §7.5.6',
    descricao: 'Revisão anual formal das VCPs vigentes: dados de processo, desvios, mudanças e avaliação de necessidade de revalidação.',
  },
  {
    id: 'VAL-03', categoria: 'Validações e Qualificações',
    titulo: 'Revisão periódica de Sala Limpa + certificação ISO 14644-2',
    tipo: 'Monitoramento', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'REV-2026-003 / ISO 14644-2',
    descricao: 'Revisão periódica da qualificação da Sala Limpa ISO 7, certificação de partículas e verificação de filtros HEPA.',
  },
  {
    id: 'VAL-04', categoria: 'Validações e Qualificações',
    titulo: 'Revisão periódica de validação de esterilização',
    tipo: 'Revisão', periodicidade: 'Anual', prioridade: 'Alta',
    referencia: 'REV-2026-004 / ISO 13485 §7.5.7',
    descricao: 'Revisão periódica do processo de esterilização validado: parâmetros críticos, testes de produto e avaliação de eficácia.',
  },
];

// Módulo state (persiste enquanto a rota está ativa)
let _view = 'lista';
let _planMonth = null;
let _onlyMine = false;

function getPlanMonth() {
  if (!_planMonth) {
    _planMonth = new Date();
    _planMonth.setDate(1);
    _planMonth.setHours(0, 0, 0, 0);
  }
  return _planMonth;
}

function buildFields() {
  const equipe = db.get('equipe').map(m => m.nome);
  return [
    { id: 'titulo',      label: 'Título da Atividade',  type: 'text',     required: true,  span: 2 },
    { id: 'responsavel', label: 'Responsável',           type: 'select',   required: true,  span: 1, options: equipe.length ? equipe : ['—'] },
    { id: 'tipo',        label: 'Tipo',                  type: 'select',   required: true,  span: 1, options: TIPOS },
    { id: 'prioridade',  label: 'Prioridade',            type: 'select',   required: false, span: 1, options: PRIORIDADES },
    { id: 'status',      label: 'Status',                type: 'select',   required: true,  span: 1, options: STATUS_LIST },
    { id: 'dataInicio',  label: 'Data de Início',           type: 'date',     required: false, span: 1 },
    { id: 'prazo',       label: 'Prazo',                    type: 'date',     required: false, span: 1 },
    { id: 'ultimoEnvio', label: 'Último Envio / Conclusão', type: 'date',     required: false, span: 1 },
    { id: 'descricao',   label: 'Descrição',             type: 'textarea', required: false, span: 2 },
    { id: 'observacoes', label: 'Observações',           type: 'textarea', required: false, span: 2 },
  ];
}

function canEdit(record, session = getSession()) {
  return can(session, 'atividades', A.EDIT);
}

function visibleItems(session) {
  const all = db.get('atividades');
  if (_onlyMine && session?.nome) return all.filter(r => r.responsavel === session.nome);
  return all;
}

function sortByPriorityAndDeadline(items) {
  return [...items].sort((a, b) => {
    const doneA = STATUS_DONE.has(a.status) ? 1 : 0;
    const doneB = STATUS_DONE.has(b.status) ? 1 : 0;
    if (doneA !== doneB) return doneA - doneB;
    const po = (PRIO_ORDER[a.prioridade] ?? 3) - (PRIO_ORDER[b.prioridade] ?? 3);
    if (po !== 0) return po;
    if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
    return a.prazo ? -1 : 1;
  });
}

// ── KPI ────────────────────────────────────────────────────────────────────────

function kpiBar(items, planMonth) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  if (_view === 'planejamento' && planMonth) {
    const mesInicio = new Date(planMonth.getFullYear(), planMonth.getMonth(), 1);
    const mesFim    = new Date(planMonth.getFullYear(), planMonth.getMonth() + 1, 0);

    const inMonth = r => {
      const ini = r.dataInicio ? new Date(r.dataInicio + 'T00:00:00') : null;
      const fim = r.prazo     ? new Date(r.prazo + 'T00:00:00')     : null;
      if (!ini && !fim) return !STATUS_DONE.has(r.status);
      if (ini && ini > mesFim) return false;
      if (fim && fim < mesInicio) return false;
      return true;
    };

    const noPeriodo = items.filter(inMonth);
    const ativas    = items.filter(r => !STATUS_DONE.has(r.status));
    const alta      = ativas.filter(r => r.prioridade === 'Alta');
    const vencidas  = ativas.filter(r => r.prazo && new Date(r.prazo + 'T00:00:00') < hoje);
    const conclMes  = items.filter(r => r.status === 'Concluída' && r.prazo &&
      new Date(r.prazo + 'T00:00:00') >= mesInicio && new Date(r.prazo + 'T00:00:00') <= mesFim);

    const kpis = [
      { label: 'No período',      val: noPeriodo.length, cor: 'var(--blue)' },
      { label: 'Alta prioridade', val: alta.length,      cor: alta.length      ? 'var(--red)'   : 'var(--muted)' },
      { label: 'Vencidas',        val: vencidas.length,  cor: vencidas.length  ? 'var(--red)'   : 'var(--muted)' },
      { label: 'Concluídas',      val: conclMes.length,  cor: 'var(--green)' },
    ];

    return kpis.map((k, i) => `
      <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
        <div style="font-size:1.4rem;font-weight:700;color:${k.cor}">${k.val}</div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${k.label}</div>
      </div>`).join('');
  }

  // Lista KPI
  const counts = { Planejada: 0, 'Em Andamento': 0, Concluída: 0, Cancelada: 0 };
  items.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  const colors = { Planejada: 'var(--blue)', 'Em Andamento': 'var(--amber)', Concluída: 'var(--green)', Cancelada: 'var(--muted)' };

  return STATUS_LIST.map((s, i) => `
    <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
      <div style="font-size:1.4rem;font-weight:700;color:${colors[s]}">${counts[s]}</div>
      <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${s}</div>
    </div>`).join('');
}

// ── Vista Lista ────────────────────────────────────────────────────────────────

function renderTable(items, session) {
  if (!items.length) return emptyState('Nenhuma atividade encontrada.');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Título</th><th>Responsável</th><th>Tipo</th><th>Prioridade</th><th>Prazo</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const vencido = r.prazo && !STATUS_DONE.has(r.status) && new Date(r.prazo + 'T00:00:00') < hoje;
            const pCor    = PRIO_COR[r.prioridade];
            const edit    = canEdit(r, session);
            return `<tr>
              <td>
                <strong>${r.titulo}</strong>
                ${r.templateRef ? `<div style="font-size:0.68rem;color:var(--muted);margin-top:1px">📚 ${CATALOGO.find(t=>t.id===r.templateRef)?.referencia||r.templateRef}</div>` : ''}
                ${r.origem === 'docsAdmin' ? `<div style="font-size:0.68rem;color:#1e40af;background:#eff6ff;padding:1px 6px;border-radius:4px;display:inline-block;margin-top:2px">📄 Docs Administrativos</div>` : ''}
                ${r.ultimoEnvio ? `<div style="font-size:0.68rem;color:#16a34a;margin-top:2px">✓ Último envio: ${fmtDate(r.ultimoEnvio)}</div>` : ''}
                ${r.descricao ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:2px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</div>` : ''}
              </td>
              <td style="font-size:0.82rem">${r.responsavel || '—'}</td>
              <td style="font-size:0.78rem;color:var(--muted)">${r.tipo || '—'}</td>
              <td>${r.prioridade
                ? `<span style="font-size:0.72rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${pCor}22;color:${pCor}">${r.prioridade}</span>`
                : '<span style="color:var(--muted)">—</span>'}</td>
              <td style="font-size:0.82rem;${vencido ? 'color:var(--red);font-weight:600' : ''}">${r.prazo ? formatDate(r.prazo) + (vencido ? ' ⚠' : '') : '—'}</td>
              <td>${statusPill(r.status)}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="${edit ? 'Editar' : 'Visualizar'}">${edit ? '✏' : '👁'}</button>
                  ${edit ? `<button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>` : ''}
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Vista Planejamento ─────────────────────────────────────────────────────────

function renderPlanning(items, session, planMonth) {
  const equipe  = db.get('equipe').map(m => m.nome);
  const membros = equipe;

  const mesLabel  = planMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const mesInicio = new Date(planMonth.getFullYear(), planMonth.getMonth(), 1);
  const mesFim    = new Date(planMonth.getFullYear(), planMonth.getMonth() + 1, 0);
  const hoje      = new Date(); hoje.setHours(0, 0, 0, 0);

  const inMonth = r => {
    const ini = r.dataInicio ? new Date(r.dataInicio + 'T00:00:00') : null;
    const fim = r.prazo     ? new Date(r.prazo + 'T00:00:00')     : null;
    if (!ini && !fim) return !STATUS_DONE.has(r.status);
    if (ini && ini > mesFim)   return false;
    if (fim && fim < mesInicio) return false;
    return true;
  };

  const rows = membros.map(nome => {
    const pessoaAll = items.filter(r => r.responsavel === nome && inMonth(r));
    const ativas    = sortByPriorityAndDeadline(pessoaAll.filter(r => !STATUS_DONE.has(r.status)));
    const concluidas = pessoaAll.filter(r => r.status === 'Concluída');
    const altaPrio   = ativas.filter(r => r.prioridade === 'Alta');
    const vencidas   = ativas.filter(r => r.prazo && new Date(r.prazo + 'T00:00:00') < hoje);

    if (pessoaAll.length === 0) return '';

    return `
      <div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:12px">
        <div style="padding:10px 16px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px">
          <div style="display:flex;align-items:center;gap:10px">
            <strong style="font-size:0.9rem">${nome}</strong>
            <span style="font-size:0.72rem;color:var(--muted)">${ativas.length} ativa${ativas.length !== 1 ? 's' : ''}</span>
            ${concluidas.length ? `<span style="font-size:0.72rem;color:var(--green)">✓ ${concluidas.length} concluída${concluidas.length !== 1 ? 's' : ''}</span>` : ''}
          </div>
          <div style="display:flex;gap:6px;align-items:center">
            ${altaPrio.length ? `<span style="font-size:0.7rem;font-weight:700;color:var(--red);padding:2px 8px;border-radius:8px;background:#fee2e230">🔴 ${altaPrio.length} alta</span>` : ''}
            ${vencidas.length ? `<span style="font-size:0.7rem;font-weight:700;color:var(--red);padding:2px 8px;border-radius:8px;background:#fee2e230">⚠ ${vencidas.length} vencida${vencidas.length !== 1 ? 's' : ''}</span>` : ''}
          </div>
        </div>
        ${ativas.length === 0 && concluidas.length === 0
          ? `<div style="padding:14px 16px;font-size:0.78rem;color:var(--muted);font-style:italic">Nenhuma atividade no período.</div>`
          : `<div style="padding:10px 16px;display:flex;flex-direction:column;gap:6px">
              ${ativas.map(r => {
                const vencido = r.prazo && new Date(r.prazo + 'T00:00:00') < hoje;
                const pCor    = PRIO_COR[r.prioridade] || 'var(--border)';
                return `
                  <div style="display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--border);border-left:4px solid ${pCor};border-radius:7px;background:var(--bg);cursor:pointer"
                       data-action="edit" data-id="${r.id}">
                    <div style="flex:1;min-width:0">
                      <div style="font-size:0.83rem;font-weight:600;color:var(--text)">${r.titulo}</div>
                      ${r.descricao ? `<div style="font-size:0.7rem;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.descricao}</div>` : ''}
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
                      ${r.tipo ? `<span style="font-size:0.68rem;color:var(--muted)">${r.tipo}</span>` : ''}
                      ${r.prioridade ? `<span style="font-size:0.68rem;font-weight:700;padding:1px 7px;border-radius:8px;background:${pCor}22;color:${pCor}">${r.prioridade}</span>` : ''}
                      ${r.prazo ? `<span style="font-size:0.72rem;font-weight:500;color:${vencido ? 'var(--red)' : 'var(--muted)'}">${vencido ? '⚠ ' : ''}${formatDate(r.prazo)}</span>` : ''}
                      ${statusPill(r.status)}
                    </div>
                  </div>`;
              }).join('')}
              ${concluidas.length ? `
                <details style="margin-top:2px">
                  <summary style="font-size:0.72rem;color:var(--muted);cursor:pointer;padding:4px 2px;user-select:none">✓ ${concluidas.length} concluída${concluidas.length !== 1 ? 's' : ''} no período</summary>
                  <div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
                    ${concluidas.map(r => `
                      <div style="display:flex;align-items:center;gap:10px;padding:7px 12px;border:1px solid var(--border);border-radius:7px;background:var(--bg);opacity:.55;cursor:pointer"
                           data-action="edit" data-id="${r.id}">
                        <span style="font-size:0.8rem;color:var(--muted);text-decoration:line-through;flex:1">${r.titulo}</span>
                        ${r.prazo ? `<span style="font-size:0.7rem;color:var(--muted)">${formatDate(r.prazo)}</span>` : ''}
                        ${statusPill(r.status)}
                      </div>`).join('')}
                  </div>
                </details>` : ''}
            </div>`
        }
      </div>
    `;
  }).filter(Boolean).join('');

  const totalActive = membros.reduce(
    (sum, nome) => sum + items.filter(r => r.responsavel === nome && inMonth(r) && !STATUS_DONE.has(r.status)).length, 0
  );
  const cargaBar = totalActive > 0 ? `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 16px;margin-bottom:12px">
      <div style="font-size:0.67rem;font-weight:700;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-bottom:7px">Carga por Pessoa</div>
      <div style="display:flex;flex-direction:column;gap:5px">
        ${membros.map(nome => {
          const count = items.filter(r => r.responsavel === nome && inMonth(r) && !STATUS_DONE.has(r.status)).length;
          if (!count) return '';
          const pct = Math.round(count / totalActive * 100);
          return `<div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:0.72rem;color:var(--text);min-width:90px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome.split(' ')[0]}</span>
            <div style="flex:1;background:var(--border);border-radius:3px;height:7px;overflow:hidden">
              <div style="width:${pct}%;background:var(--accent);height:100%;border-radius:3px"></div>
            </div>
            <span style="font-size:0.7rem;color:var(--muted);min-width:28px;text-align:right">${count}</span>
          </div>`;
        }).filter(Boolean).join('')}
      </div>
    </div>` : '';

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <button class="btn btn-secondary btn-sm" data-plan-nav="-1">← Anterior</button>
      <span style="font-weight:700;font-size:1rem;text-transform:capitalize">${mesLabel}</span>
      <button class="btn btn-secondary btn-sm" data-plan-nav="1">Próximo →</button>
    </div>
    ${cargaBar}
    ${rows || emptyState('Nenhuma atividade planejada para este período.')}
  `;
}

// ── Vista Calendário ───────────────────────────────────────────────────────────

function renderCalendar(items, planMonth) {
  const year   = planMonth.getFullYear();
  const month  = planMonth.getMonth();
  const label  = planMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const hoje   = new Date(); hoje.setHours(0, 0, 0, 0);
  const todayD = hoje.getFullYear() === year && hoje.getMonth() === month ? hoje.getDate() : -1;

  const byDay = {};
  items.forEach(r => {
    if (!r.prazo) return;
    const d = new Date(r.prazo + 'T00:00:00');
    if (d.getFullYear() !== year || d.getMonth() !== month) return;
    const day = d.getDate();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(r);
  });

  const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const hdr  = DIAS.map(d => `<div style="text-align:center;font-size:0.68rem;font-weight:700;color:var(--muted);padding:5px 2px">${d}</div>`).join('');

  const startDow  = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < startDow; i++) {
    cells += `<div style="min-height:76px"></div>`;
  }
  for (let d = 1; d <= totalDays; d++) {
    const dayItems = byDay[d] || [];
    const isToday  = d === todayD;
    const shown    = dayItems.slice(0, 3);
    const extra    = dayItems.length - shown.length;
    const hasOver  = dayItems.some(r => !STATUS_DONE.has(r.status) && r.prazo < hoje.toISOString().slice(0, 10));

    const pills = shown.map(r => {
      const pCor = PRIO_COR[r.prioridade] || '#64748b';
      const done = r.status === 'Concluída';
      return `<div title="${r.titulo}${r.responsavel ? ' · ' + r.responsavel : ''}"
                   data-action="edit" data-id="${r.id}"
                   style="font-size:0.6rem;padding:1px 4px;border-radius:3px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
                          background:${done ? '#d1fae5' : pCor + '22'};color:${done ? '#065f46' : pCor};border:1px solid ${done ? '#6ee7b7' : pCor + '55'}">
                ${done ? '✓ ' : ''}${r.titulo}
              </div>`;
    }).join('');

    cells += `
      <div style="min-height:76px;padding:4px;border:1px solid var(--border);border-radius:5px;display:flex;flex-direction:column;gap:2px;
                  background:${isToday ? '#eff6ff' : 'var(--bg)'};${isToday ? 'outline:2px solid var(--accent);outline-offset:-2px;' : ''}">
        <div style="font-size:0.72rem;font-weight:${isToday ? '700' : '500'};color:${isToday ? 'var(--accent)' : hasOver ? '#dc2626' : 'var(--text)'}">
          ${d}
        </div>
        ${pills}
        ${extra > 0 ? `<div style="font-size:0.58rem;color:var(--muted);margin-top:1px">+${extra} mais</div>` : ''}
      </div>`;
  }

  return `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <button class="btn btn-secondary btn-sm" data-plan-nav="-1">&#8592; Anterior</button>
      <span style="font-weight:700;font-size:1rem;text-transform:capitalize">${label}</span>
      <button class="btn btn-secondary btn-sm" data-plan-nav="1">Pr&#243;ximo &#8594;</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px;margin-bottom:3px">${hdr}</div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:3px">${cells}</div>`;
}

// ── Planejamento Anual — Modal Wizard ──────────────────────────────────────────

function openPlanAnualModal(container) {
  const equipe       = db.get('equipe').map(m => m.nome);
  const defaultMonth = new Date().toISOString().slice(0, 7);

  function qtdForPeriod(periodicidade, horizonte) {
    switch (periodicidade) {
      case 'Mensal':     return horizonte;
      case 'Bimestral':  return Math.ceil(horizonte / 2);
      case 'Trimestral': return Math.ceil(horizonte / 3);
      case 'Semestral':  return Math.ceil(horizonte / 6);
      case 'Anual':      return Math.ceil(horizonte / 12);
      default:           return 1;
    }
  }

  const tableRows = CATALOGO.map(t => {
    const periCor = PERI_COR[t.periodicidade] || '#64748b';
    const pCor    = PRIO_COR[t.prioridade]    || '#64748b';
    return `
      <tr data-plan-row="${t.id}">
        <td style="padding:6px 10px;text-align:center;border-bottom:1px solid var(--border)">
          <input type="checkbox" class="plan-chk" checked style="cursor:pointer;width:15px;height:15px">
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid var(--border)">
          <div style="font-size:0.82rem;font-weight:600;color:var(--text)">${t.titulo}</div>
          <div style="display:flex;gap:4px;margin-top:2px;flex-wrap:wrap">
            <span style="font-size:0.62rem;padding:1px 7px;border-radius:8px;background:${periCor}20;color:${periCor};font-weight:600;border:1px solid ${periCor}40">${t.periodicidade}</span>
            <span style="font-size:0.62rem;padding:1px 7px;border-radius:8px;background:${pCor}15;color:${pCor};font-weight:600">${t.prioridade}</span>
            <span style="font-size:0.62rem;color:var(--muted)">${t.categoria}</span>
          </div>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid var(--border)">
          <select class="plan-resp" style="font-size:0.75rem;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);width:130px">
            <option value="">&#8212; selecione &#8212;</option>
            ${equipe.map(n => `<option value="${n}">${n.split(' ')[0]}</option>`).join('')}
          </select>
        </td>
        <td style="padding:6px 10px;border-bottom:1px solid var(--border)">
          <input type="month" class="plan-mes" value="${defaultMonth}"
                 style="font-size:0.75rem;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);width:130px">
        </td>
        <td class="plan-qtd" style="padding:6px 10px;text-align:center;font-size:0.8rem;font-weight:600;color:var(--muted);border-bottom:1px solid var(--border)">12</td>
      </tr>`;
  }).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'align-items:flex-start;padding:20px;overflow-y:auto';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:840px;width:100%;margin:auto">
      <div class="modal-header">
        <h3 style="margin:0;font-size:1rem">&#128198; Planejar Atividades do Ano</h3>
        <button class="modal-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">&#10005;</button>
      </div>
      <div class="modal-body" style="padding:0">
        <div style="padding:12px 18px;background:var(--surface);border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap">
          <div>
            <label style="font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px">Horizonte</label>
            <select id="plan-horizonte" style="font-size:0.8rem;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);width:120px">
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12" selected>12 meses</option>
              <option value="24">24 meses</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px">Respons&#225;vel global</label>
            <select id="plan-resp-global" style="font-size:0.8rem;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);width:160px">
              <option value="">&#8212; individual &#8212;</option>
              ${equipe.map(n => `<option value="${n}">${n}</option>`).join('')}
            </select>
          </div>
          <div>
            <label style="font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;display:block;margin-bottom:3px">M&#234;s inicial global</label>
            <input type="month" id="plan-mes-global" value="${defaultMonth}"
                   style="font-size:0.8rem;padding:5px 8px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);width:140px">
          </div>
          <button class="btn btn-secondary btn-sm" id="plan-apply-global">Aplicar a todos</button>
        </div>
        <div style="overflow-x:auto;max-height:440px;overflow-y:auto">
          <table style="width:100%;border-collapse:collapse;min-width:580px">
            <thead style="position:sticky;top:0;background:var(--surface);z-index:1;box-shadow:0 1px 0 var(--border)">
              <tr>
                <th style="padding:8px 10px;width:38px;text-align:center">
                  <input type="checkbox" id="plan-check-all" checked style="cursor:pointer;width:15px;height:15px">
                </th>
                <th style="padding:8px 10px;text-align:left;font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase">Atividade</th>
                <th style="padding:8px 10px;text-align:left;font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;width:150px">Respons&#225;vel</th>
                <th style="padding:8px 10px;text-align:left;font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;width:150px">M&#234;s de In&#237;cio</th>
                <th style="padding:8px 10px;text-align:center;font-size:0.68rem;font-weight:700;color:var(--muted);text-transform:uppercase;width:52px">Qtd</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span id="plan-summary" style="font-size:0.78rem;color:var(--muted)"></span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="plan-cancel">Cancelar</button>
          <button class="btn btn-primary" id="plan-gerar">Gerar Atividades &#8594;</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#plan-cancel').addEventListener('click', close);

  function getHorizonte() { return Number(overlay.querySelector('#plan-horizonte').value) || 12; }

  function updateQtd() {
    const h = getHorizonte();
    overlay.querySelectorAll('[data-plan-row]').forEach(row => {
      const t = CATALOGO.find(c => c.id === row.dataset.planRow);
      if (t) row.querySelector('.plan-qtd').textContent = qtdForPeriod(t.periodicidade, h);
    });
    updateSummary();
  }

  function updateSummary() {
    const h = getHorizonte();
    let total = 0, templates = 0;
    overlay.querySelectorAll('[data-plan-row]').forEach(row => {
      if (!row.querySelector('.plan-chk').checked) return;
      templates++;
      const t = CATALOGO.find(c => c.id === row.dataset.planRow);
      if (t) total += qtdForPeriod(t.periodicidade, h);
    });
    overlay.querySelector('#plan-summary').textContent =
      templates + ' template' + (templates !== 1 ? 's' : '') + ' · ' + total + ' atividade' + (total !== 1 ? 's' : '') + ' serão geradas';
  }

  overlay.querySelector('#plan-horizonte').addEventListener('change', updateQtd);
  overlay.querySelector('#plan-check-all').addEventListener('change', e => {
    overlay.querySelectorAll('.plan-chk').forEach(c => { c.checked = e.target.checked; });
    updateSummary();
  });
  overlay.querySelectorAll('.plan-chk').forEach(c => c.addEventListener('change', updateSummary));

  overlay.querySelector('#plan-apply-global').addEventListener('click', () => {
    const resp = overlay.querySelector('#plan-resp-global').value;
    const mes  = overlay.querySelector('#plan-mes-global').value;
    if (resp) overlay.querySelectorAll('.plan-resp').forEach(s => { s.value = resp; });
    if (mes)  overlay.querySelectorAll('.plan-mes').forEach(i => { i.value = mes; });
  });

  overlay.querySelector('#plan-gerar').addEventListener('click', () => {
    const h = getHorizonte();
    let count = 0;
    overlay.querySelectorAll('[data-plan-row]').forEach(row => {
      if (!row.querySelector('.plan-chk').checked) return;
      const t = CATALOGO.find(c => c.id === row.dataset.planRow);
      if (!t) return;
      const responsavel = row.querySelector('.plan-resp').value;
      const mesBase     = row.querySelector('.plan-mes').value;
      if (!mesBase) return;

      const endDate = new Date(mesBase + '-01T00:00:00');
      endDate.setMonth(endDate.getMonth() + h);
      const endISO  = endDate.toISOString().slice(0, 10);
      const qtd     = qtdForPeriod(t.periodicidade, h);
      let current   = mesBase + '-01';
      let generated = 0;

      while (current <= endISO && generated < 60) {
        const d      = new Date(current + 'T00:00:00');
        const suffix = qtd > 1
          ? ' — ' + d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
          : '';
        db.add('atividades', {
          titulo: t.titulo + suffix, tipo: t.tipo, prioridade: t.prioridade,
          responsavel, prazo: current, status: 'Planejada',
          dataInicio: '', descricao: t.descricao, observacoes: '',
          templateRef: t.id, ultimoEnvio: '', origem: '',
        });
        count++;
        generated++;
        const next = nextDate(current, t.periodicidade);
        if (!next || next === current) break;
        current = next;
      }
    });

    close();
    if (count === 0) {
      toast('Nenhum template selecionado ou sem mês de início.', 'warning');
    } else {
      toast(count + ' atividade' + (count !== 1 ? 's' : '') + ' gerada' + (count !== 1 ? 's' : '') + ' com sucesso!');
      _view = 'planejamento';
      refresh(container);
    }
  });

  updateSummary();
}

// ── Vista Catálogo ─────────────────────────────────────────────────────────────

function renderCatalog(atividades, session) {
  const isAdmin = session?.perfil === 'GQ Administrador';
  const usosMap = {};
  atividades.forEach(r => { if (r.templateRef) usosMap[r.templateRef] = (usosMap[r.templateRef] || 0) + 1; });

  // último envio por template (mais recente entre as concluídas)
  const ultimoEnvioMap = {};
  atividades
    .filter(r => r.templateRef && r.ultimoEnvio)
    .sort((a, b) => a.ultimoEnvio.localeCompare(b.ultimoEnvio))
    .forEach(r => { ultimoEnvioMap[r.templateRef] = r.ultimoEnvio; });

  const hoje = new Date().toISOString().slice(0, 10);

  const categories = [...new Set(CATALOGO.map(t => t.categoria))];

  const html = categories.map(cat => {
    const templates = CATALOGO.filter(t => t.categoria === cat);
    const cards = templates.map(t => {
      const usos     = usosMap[t.id] || 0;
      const pCor     = PRIO_COR[t.prioridade] || '#64748b';
      const periCor  = PERI_COR[t.periodicidade] || '#64748b';
      const ultimo   = ultimoEnvioMap[t.id] || null;
      const proximo  = ultimo ? nextDate(ultimo, t.periodicidade) : null;
      const atrasado = proximo && proximo < hoje;

      const rastreio = ultimo ? `
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px;padding:5px 8px;background:var(--surface);border-radius:5px;font-size:0.7rem">
          <span style="color:#16a34a;font-weight:600">✓ Último envio: ${fmtDate(ultimo)}</span>
          ${proximo ? `<span style="color:${atrasado ? '#dc2626' : '#64748b'};font-weight:${atrasado ? '700' : '500'}">→ Próximo: ${fmtDate(proximo)}${atrasado ? ' ⚠' : ''}</span>` : ''}
        </div>` : '';

      return `
        <div style="border:1px solid var(--border);border-radius:8px;padding:14px 16px;background:var(--bg);display:flex;align-items:flex-start;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
              <strong style="font-size:0.85rem;color:var(--text)">${t.titulo}</strong>
              ${usos ? `<span style="font-size:0.68rem;background:#eff6ff;color:#1e40af;padding:1px 7px;border-radius:8px;font-weight:600">${usos}× planejada${usos>1?'s':''}</span>` : ''}
            </div>
            <div style="display:flex;gap:5px;align-items:center;flex-wrap:wrap;margin-bottom:7px">
              <span style="font-size:0.68rem;padding:1px 8px;border-radius:8px;background:${periCor}20;color:${periCor};font-weight:600;border:1px solid ${periCor}40">${t.periodicidade}</span>
              <span style="font-size:0.68rem;padding:1px 8px;border-radius:8px;background:${pCor}15;color:${pCor};font-weight:600">${t.prioridade}</span>
              <span style="font-size:0.68rem;padding:1px 7px;border-radius:8px;background:var(--surface);color:var(--muted);font-family:monospace">${t.referencia}</span>
            </div>
            <p style="font-size:0.72rem;color:var(--muted);margin:0;line-height:1.5">${t.descricao}</p>
            ${rastreio}
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;margin-top:2px">
            ${isAdmin ? `<button class="btn btn-primary btn-sm" data-action="plan" data-tid="${t.id}" style="white-space:nowrap">+ Planejar</button>` : ''}
            ${t.route ? `<button class="btn btn-secondary btn-sm" data-action="open-route" data-route="${t.route}" style="white-space:nowrap;font-size:0.72rem">→ Abrir registro</button>` : ''}
          </div>
        </div>`;
    }).join('');

    return `
      <div style="margin-bottom:28px">
        <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:7px;border-bottom:2px solid var(--border)">${cat}</div>
        <div style="display:flex;flex-direction:column;gap:8px">${cards}</div>
      </div>`;
  }).join('');

  const infoText = isAdmin
    ? 'Clique em <strong>+ Planejar</strong> para criar uma atividade individual, ou use <strong>Planejar Ano Completo</strong> para gerar o planejamento do ano de uma vez.'
    : 'Catálogo de referência das atividades obrigatórias do SGQ. Use <strong>+ Nova Atividade</strong> para adicionar atividades à sua agenda individual.';

  return `
    <div style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <div style="flex:1;padding:10px 14px;background:#eff6ff;border-radius:7px;border:1px solid #bfdbfe;font-size:0.78rem;color:#1e40af;line-height:1.5">
        &#128218; <strong>Catálogo de atividades obrigatórias do SGQ.</strong> ${infoText}
      </div>
      ${isAdmin ? `<button class="btn btn-primary" data-action="plan-anual" style="white-space:nowrap;flex-shrink:0">&#128198; Planejar Ano Completo</button>` : ''}
    </div>
    ${html}`;
}

// ── Refresh central ────────────────────────────────────────────────────────────

function refresh(container) {
  const session   = getSession();
  const planMonth = getPlanMonth();
  const allVisible = visibleItems(session);

  // KPI — oculta no catálogo
  const kpiEl = container.querySelector('#atv-kpi');
  if (kpiEl) {
    if (_view === 'catalogo') {
      kpiEl.innerHTML = '';
    } else {
      kpiEl.innerHTML = `<div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">${kpiBar(allVisible, planMonth)}</div>`;
    }
  }

  // View toggle buttons
  container.querySelectorAll('[data-view-btn]').forEach(btn => {
    const active = btn.dataset.viewBtn === _view;
    btn.className = active ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
    btn.style.borderRadius = '5px';
  });

  // Toggle "Minhas Atividades"
  const mineBtn = container.querySelector('[data-action="toggle-mine"]');
  if (mineBtn) {
    mineBtn.className = `btn ${_onlyMine ? 'btn-primary' : 'btn-secondary'} btn-sm`;
    mineBtn.style.borderRadius = '5px';
  }

  // Toolbar visível apenas na vista lista
  const toolbar = container.querySelector('.toolbar');
  if (toolbar) toolbar.style.display = _view === 'lista' ? '' : 'none';

  if (_view === 'lista') {
    const search  = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
    const fStatus = container.querySelector('[data-filter="status"]')?.value ?? '';
    const fResp   = container.querySelector('[data-filter="resp"]')?.value ?? '';
    const fPrio   = container.querySelector('[data-filter="prio"]')?.value ?? '';

    let items = allVisible;
    if (search)  items = items.filter(r => r.titulo?.toLowerCase().includes(search) || (r.responsavel || '').toLowerCase().includes(search));
    if (fStatus) items = items.filter(r => r.status     === fStatus);
    if (fResp)   items = items.filter(r => r.responsavel === fResp);
    if (fPrio)   items = items.filter(r => r.prioridade  === fPrio);

    container.querySelector('#atv-content').innerHTML = renderTable(sortByPriorityAndDeadline(items), session);
  } else if (_view === 'planejamento') {
    container.querySelector('#atv-content').innerHTML = renderPlanning(allVisible, session, planMonth);
  } else if (_view === 'calendario') {
    container.querySelector('#atv-content').innerHTML = renderCalendar(allVisible, planMonth);
  } else if (_view === 'catalogo') {
    container.querySelector('#atv-content').innerHTML = renderCatalog(db.get('atividades'), session);
  }
}

// ── Módulo ────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    const session  = getSession();
    const items    = visibleItems(session);
    const equipe   = db.get('equipe').map(m => m.nome);
    const canCreate = can(session, 'atividades', A.EDIT);

    container.innerHTML = `
      <div class="page-header">
        <h2>Atividades</h2>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <div style="display:flex;gap:3px;border:1px solid var(--border);border-radius:8px;padding:3px;background:var(--surface)">
            <button class="btn btn-primary btn-sm" data-view-btn="lista" style="border-radius:5px">&#9776; Lista</button>
            <button class="btn btn-secondary btn-sm" data-view-btn="planejamento" style="border-radius:5px">&#128101; Por Pessoa</button>
            <button class="btn btn-secondary btn-sm" data-view-btn="calendario" style="border-radius:5px">&#128198; Calendário</button>
            <button class="btn btn-secondary btn-sm" data-view-btn="catalogo" style="border-radius:5px">&#128218; Catálogo</button>
          </div>
          ${session?.nome ? `<button class="btn ${_onlyMine ? 'btn-primary' : 'btn-secondary'} btn-sm" data-action="toggle-mine" style="border-radius:5px">&#128100; Minhas Atividades</button>` : ''}
          ${canCreate ? `<button class="btn btn-primary" data-action="new">+ Nova Atividade</button>` : ''}
        </div>
      </div>
      <div id="atv-kpi"></div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por título ou responsável…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS_LIST)}
        </select>
        <select class="toolbar-select" data-filter="prio">
          <option value="">Todas as prioridades</option>
          ${selectOptions(PRIORIDADES)}
        </select>
        <select class="toolbar-select" data-filter="resp">
          <option value="">Todas as responsáveis</option>
          ${equipe.map(n => `<option value="${n}">${n.split(' ')[0]}</option>`).join('')}
        </select>
      </div>
      <div class="card" style="padding:16px">
        <div id="atv-content"></div>
      </div>
    `;

    refresh(container);
  },

  init(container) {
    container.addEventListener('click', e => {
      // Troca de vista
      const viewBtn = e.target.closest('[data-view-btn]');
      if (viewBtn) {
        _view = viewBtn.dataset.viewBtn;
        refresh(container);
        return;
      }

      // Navegação de mês no planejamento
      const planNav = e.target.closest('[data-plan-nav]');
      if (planNav) {
        const m = getPlanMonth();
        m.setMonth(m.getMonth() + Number(planNav.dataset.planNav));
        refresh(container);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, tid } = btn.dataset;
      const numId   = id !== undefined ? Number(id) : null;
      const session = getSession();

      if (action === 'toggle-mine') {
        _onlyMine = !_onlyMine;
        refresh(container);
        return;
      }

      // Sessão expirada ou sem permissão → aviso claro
      const needsEdit = ['new', 'plan-anual', 'plan', 'delete'].includes(action);
      if (needsEdit && !can(session, 'atividades', A.EDIT)) {
        toast(!session ? 'Sessão expirada. Clique em Sair e faça login novamente.' : 'Sem permissão para esta ação.', 'warning');
        return;
      }

      // Planejamento do catálogo exclusivo para GQ Administrador
      if (['plan-anual', 'plan'].includes(action) && session?.perfil !== 'GQ Administrador') {
        toast('Planejamento do catálogo restrito ao GQ Administrador.', 'warning');
        return;
      }

      if (action === 'new') {
        if (!can(session, 'atividades', A.EDIT)) return;
        openModal({
          title: 'Nova Atividade',
          fields: buildFields(),
          data: { status: 'Planejada', prioridade: 'Média' },
          onSave: data => {
            if (data.status === 'Concluída' && !data.ultimoEnvio) data.ultimoEnvio = new Date().toISOString().slice(0, 10);
            db.add('atividades', data);
            toast('Atividade criada!');
            refresh(container);
          },
        });
      }

      if (action === 'plan-anual') {
        if (!can(session, 'atividades', A.EDIT)) return;
        openPlanAnualModal(container);
      }

      if (action === 'plan') {
        const t = CATALOGO.find(t => t.id === tid);
        if (!t || !can(session, 'atividades', A.EDIT)) return;
        openModal({
          title: `Planejar — ${t.titulo}`,
          fields: buildFields(),
          data: {
            titulo:    t.titulo,
            tipo:      t.tipo,
            prioridade: t.prioridade,
            status:    'Planejada',
            descricao: t.descricao,
          },
          onSave: data => {
            if (data.status === 'Concluída' && !data.ultimoEnvio) data.ultimoEnvio = new Date().toISOString().slice(0, 10);
            db.add('atividades', { ...data, templateRef: t.id });
            toast('Atividade planejada!');
            _view = 'lista';
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('atividades', numId);
        if (!record) return;
        const auth = canEdit(record, session);
        openModal({
          title: `${auth ? 'Editar' : '👁 Visualizar'} Atividade`,
          fields: auth
            ? buildFields()
            : buildFields().map(f => f.type !== 'heading' ? { ...f, readonly: true } : f),
          data: record,
          onSave: data => {
            if (!auth) return;
            if (data.status === 'Concluída' && !data.ultimoEnvio) data.ultimoEnvio = new Date().toISOString().slice(0, 10);
            db.update('atividades', numId, data);
            toast('Atividade atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'open-route') {
        window.location.hash = btn.dataset.route;
        return;
      }

      if (action === 'delete') {
        const record = db.getById('atividades', numId);
        if (!record || !canEdit(record, session)) return;
        showConfirm('Deseja excluir esta atividade?').then(ok => {
          if (!ok) return;
          db.remove('atividades', numId);
          toast('Atividade excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
