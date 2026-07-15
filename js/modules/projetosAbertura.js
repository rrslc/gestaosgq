/**
 * @fileoverview Projetos — Atividades GQ (P-PJ-001).
 * Rastreia as entregas da Garantia da Qualidade e Regulatório em cada projeto de desenvolvimento.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';

const STATUS_PROJ = ['Planejamento', 'Desenvolvimento', 'Verificação', 'Validação', 'Liberado', 'Cancelado'];
const STATUS_ATIV = ['Pendente', 'Em Andamento', 'Concluído', 'N/A'];

const ATIV_KEYS = [
  'f1_analiseReg', 'f1_requisitosEntrada',
  'f2_especProduto', 'f2_especProcesso', 'f2_checklistSaida',
  'f3_planoVerif', 'f3_protocoloSegBio', 'f3_relatorioSegBio',
  'f3_protocoloClinico', 'f3_relatorioClinico', 'f3_checklistVerif',
  'f4_planoValid', 'f4_checklistValid', 'f4_lotePiloto',
  'f5_registroHistorico', 'f5_efetividade', 'f5_termoLiberacao',
];

function calcProgress(r) {
  const applicable = ATIV_KEYS.filter(k => (r[k] || 'Pendente') !== 'N/A');
  const done = applicable.filter(k => r[k] === 'Concluído');
  return applicable.length ? Math.round(done.length / applicable.length * 100) : 0;
}

function countOverdue(r) {
  const todayStr = today();
  return ATIV_KEYS.filter(k => {
    const st    = r[k] || 'Pendente';
    const prazo = r[`${k}Prazo`];
    return prazo && prazo < todayStr && st !== 'Concluído' && st !== 'N/A';
  }).length;
}

function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const all = db.get('projetos');
  const seq = all.filter(r => (r.numero || '').endsWith(`/${yy}`)).length + 1;
  return `PRJ.${String(seq).padStart(3, '0')}/${yy}`;
}

function buildFields() {
  const nomes = db.get('equipe').map(m => m.nome);
  const respOpts = nomes.length ? nomes : undefined;

  // Helper: 3 fields per activity — status (full row), prazo + conclusão (shared row)
  const ativ = (id, label, prazoId, dataId) => [
    { id, label, type: 'select', required: false, span: 2, options: STATUS_ATIV },
    { id: prazoId, label: 'Prazo Previsto', type: 'date', required: false, span: 1 },
    { id: dataId,  label: 'Data de Conclusão', type: 'date', required: false, span: 1 },
  ];

  return [
    // Identificação
    { id: 'numero',         label: 'Nº do Projeto',               type: 'text',     required: false, span: 1, readonly: true },
    { id: 'produto',        label: 'Produto',                     type: 'text',     required: true,  span: 1 },
    { id: 'codigoProjeto',  label: 'Código do Projeto',           type: 'text',     required: false, span: 1 },
    { id: 'versao',         label: 'Versão do Projeto',           type: 'text',     required: false, span: 1 },
    { id: 'gerenteProjeto', label: 'Gerente do Projeto',          type: 'text',     required: false, span: 1 },
    { id: 'responsavelGQ',  label: 'Responsável GQ/Regulatório',  type: respOpts ? 'select' : 'text', required: true, span: 1, options: respOpts },
    { id: 'status',         label: 'Status do Projeto',           type: 'select',   required: true,  span: 1, options: STATUS_PROJ },
    { id: 'dataInicio',     label: 'Data de Início',              type: 'date',     required: false, span: 1 },
    { id: 'dataPrevisao',   label: 'Previsão de Conclusão',       type: 'date',     required: false, span: 1 },
    { id: 'observacoes',    label: 'Observações',                 type: 'textarea', required: false, span: 2 },

    // Fase 1
    { type: 'heading', label: 'Fase 1 — Planejamento' },
    ...ativ('f1_analiseReg',        'Análise Regulatória (F-PJ-038)',                 'f1_analiseRegPrazo',        'f1_analiseRegData'),
    ...ativ('f1_requisitosEntrada', 'Aprovação dos Requisitos de Entrada (F-PJ-021)', 'f1_requisitosEntradaPrazo', 'f1_requisitosEntradaData'),

    // Fase 2
    { type: 'heading', label: 'Fase 2 — Desenvolvimento dos Dados de Saída' },
    ...ativ('f2_especProduto',   'Aprovação das Especificações do Produto (F-PJ-047)',             'f2_especProdutoPrazo',   'f2_especProdutoData'),
    ...ativ('f2_especProcesso',  'Aprovação das Especificações do Processo Produtivo (F-PJ-048)', 'f2_especProcessoPrazo',  'f2_especProcessoData'),
    ...ativ('f2_checklistSaida', 'Checklist dos Dados de Saída (F-PJ-041)',                       'f2_checklistSaidaPrazo', 'f2_checklistSaidaData'),

    // Fase 3
    { type: 'heading', label: 'Fase 3 — Verificação do Projeto' },
    ...ativ('f3_planoVerif',        'Plano de Verificação do Projeto (F-PJ-043)',    'f3_planoVerifPrazo',        'f3_planoVerifData'),
    ...ativ('f3_protocoloSegBio',   'Protocolo de Avaliação de Segurança Biológica', 'f3_protocoloSegBioPrazo',   'f3_protocoloSegBioData'),
    ...ativ('f3_relatorioSegBio',   'Relatório de Avaliação de Segurança Biológica', 'f3_relatorioSegBioPrazo',   'f3_relatorioSegBioData'),
    ...ativ('f3_protocoloClinico',  'Protocolo de Avaliação Clínica',               'f3_protocoloClinicoPrazo',  'f3_protocoloClinicoData'),
    ...ativ('f3_relatorioClinico',  'Relatório de Avaliação Clínica',               'f3_relatorioClinicoPrazo',  'f3_relatorioClinicoData'),
    ...ativ('f3_checklistVerif',    'Checklist de Verificação do Projeto (F-PJ-023)', 'f3_checklistVerifPrazo',  'f3_checklistVerifData'),

    // Fase 4
    { type: 'heading', label: 'Fase 4 — Validação do Projeto' },
    ...ativ('f4_planoValid',     'Plano de Validação do Projeto (F-PJ-044)',     'f4_planoValidPrazo',     'f4_planoValidData'),
    ...ativ('f4_checklistValid', 'Checklist de Validação do Projeto (F-PJ-024)', 'f4_checklistValidPrazo', 'f4_checklistValidData'),
    ...ativ('f4_lotePiloto',     'Aprovação do Lote Piloto (F-PJ-045)',          'f4_lotePilotoPrazo',     'f4_lotePilotoData'),

    // Fase 5
    { type: 'heading', label: 'Fase 5 — Liberação do Projeto' },
    ...ativ('f5_registroHistorico', 'Registro Histórico do Projeto (F-PJ-007)',   'f5_registroHistoricoPrazo', 'f5_registroHistoricoData'),
    ...ativ('f5_efetividade',       'Efetividade do Projeto (F-PJ-032)',          'f5_efetividadePrazo',       'f5_efetividadeData'),
    ...ativ('f5_termoLiberacao',    'Aprovação do Termo de Liberação (F-PJ-046)', 'f5_termoLiberacaoPrazo',    'f5_termoLiberacaoData'),
  ];
}

function progressBar(pct) {
  const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--blue)' : 'var(--amber)';
  return `<div style="display:flex;align-items:center;gap:6px">
    <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color}"></div>
    </div>
    <span style="font-size:0.72rem;color:var(--muted);white-space:nowrap">${pct}%</span>
  </div>`;
}

function renderTable(all) {
  if (!all.length) return emptyState('Nenhum projeto cadastrado. Clique em "+ Novo Projeto" para começar.');
  return `
    <div class="table-wrapper">
      <table class="data-table">
        <thead><tr>
          <th>Número</th>
          <th>Produto</th>
          <th>Código</th>
          <th>Versão</th>
          <th>Resp. GQ</th>
          <th>Status</th>
          <th style="min-width:130px">Progresso GQ</th>
          <th>Ações</th>
        </tr></thead>
        <tbody>
          ${all.map(r => {
            const pct      = calcProgress(r);
            const atrasadas = countOverdue(r);
            const overdueTag = atrasadas
              ? `<span title="${atrasadas} atividade(s) com prazo vencido" style="display:inline-block;margin-left:6px;background:var(--red,#dc2626);color:#fff;font-size:0.62rem;font-weight:700;padding:1px 5px;border-radius:10px">⚠ ${atrasadas}</span>`
              : '';
            return `<tr>
              <td><code>${r.numero || '—'}</code></td>
              <td>${r.produto || '—'}</td>
              <td>${r.codigoProjeto || '—'}</td>
              <td>${r.versao || '—'}</td>
              <td>${r.responsavelGQ || '—'}</td>
              <td>${statusPill(r.status)}</td>
              <td>${progressBar(pct)}${overdueTag}</td>
              <td class="actions">
                <button class="btn btn-xs btn-secondary" data-action="edit"   data-id="${r.id}" title="Editar">✏</button>
                <button class="btn btn-xs btn-danger"    data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function openForm(record = null) {
  const isNew = !record;
  openModal({
    title: isNew ? 'Novo Projeto' : `Editar Projeto — ${record.numero || ''}`,
    size: 'large',
    fields: buildFields(),
    record: record
      ? { ...record }
      : { numero: generateNumero(), dataInicio: today(), status: 'Planejamento',
          f1_analiseReg: 'Pendente', f1_requisitosEntrada: 'Pendente',
          f2_especProduto: 'Pendente', f2_especProcesso: 'Pendente', f2_checklistSaida: 'Pendente',
          f3_planoVerif: 'Pendente', f3_protocoloSegBio: 'Pendente', f3_relatorioSegBio: 'Pendente',
          f3_protocoloClinico: 'Pendente', f3_relatorioClinico: 'Pendente', f3_checklistVerif: 'Pendente',
          f4_planoValid: 'Pendente', f4_checklistValid: 'Pendente', f4_lotePiloto: 'Pendente',
          f5_registroHistorico: 'Pendente', f5_efetividade: 'Pendente', f5_termoLiberacao: 'Pendente' },
    onSave: (data) => {
      if (isNew) {
        db.add('projetos', data);
        toast('Projeto criado com sucesso!');
      } else {
        db.update('projetos', record.id, data);
        toast('Projeto atualizado!');
      }
      render(document.getElementById('content'));
      init(document.getElementById('content'));
    },
  });
}

let _search = '';
let _status = '';

export function render(container) {
  const all = db.get('projetos');
  const filtered = all.filter(r => {
    const q = _search.toLowerCase();
    const matchQ = !q || (r.produto || '').toLowerCase().includes(q)
      || (r.codigoProjeto || '').toLowerCase().includes(q)
      || (r.numero || '').toLowerCase().includes(q);
    const matchS = !_status || r.status === _status;
    return matchQ && matchS;
  });

  container.innerHTML = `
    <div class="page-header">
      <h2>Projetos — Atividades GQ</h2>
      <button class="btn btn-primary" data-action="new">+ Novo Projeto</button>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:1rem">
      <input  class="input" id="proj-search"  placeholder="Buscar por produto ou código..."  value="${_search}" style="max-width:280px">
      <select class="input" id="proj-status"  style="max-width:180px">
        <option value="">Todos os status</option>
        ${STATUS_PROJ.map(s => `<option value="${s}" ${_status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>
    ${renderTable(filtered)}`;
}

export function init(container) {
  container.querySelector('#proj-search')?.addEventListener('input', e => {
    _search = e.target.value;
    render(container); init(container);
  });
  container.querySelector('#proj-status')?.addEventListener('change', e => {
    _status = e.target.value;
    render(container); init(container);
  });
  container.addEventListener('click', e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const { action, id } = btn.dataset;
    if (action === 'new') {
      openForm();
    } else if (action === 'edit') {
      const r = db.getById('projetos', id);
      if (r) openForm(r);
    } else if (action === 'delete') {
      showConfirm('Excluir este projeto permanentemente?', () => {
        db.remove('projetos', id);
        toast('Projeto excluído.');
        render(container); init(container);
      });
    }
  });
}

export default { render, init };
