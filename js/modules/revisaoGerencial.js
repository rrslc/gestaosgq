/**
 * @fileoverview Módulo Revisão Gerencial — P-SQ-020.
 * Agrega indicadores de outros módulos (somente leitura) e gerencia atas de reunião (CRUD).
 */

import { db } from '../db.js';
import { formatDate, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';

const TIPOS_REUNIAO = ['Trimestral', 'Anual'];

const CAPA_CLOSED  = ['Encerrada', 'Não Procedente'];
const RNC_CLOSED   = ['Encerrada', 'Cancelada', 'Não Procedente'];
const FORN_PROBLEM = ['Suspenso', 'Desqualificado'];

const FIELDS_ATA = [
  { id: 'dataReuniao',   label: 'Data da Reunião',              type: 'date',     required: true,  span: 1 },
  { id: 'tipo',          label: 'Tipo',                         type: 'select',   required: true,  span: 1, options: TIPOS_REUNIAO },
  { id: 'participantes', label: 'Participantes',                type: 'text',     required: true,  span: 2 },
  { id: 'temas',         label: 'Temas Discutidos',             type: 'textarea', required: false, span: 2 },
  { id: 'deliberacoes',  label: 'Deliberações / Plano de Ação', type: 'textarea', required: false, span: 2 },
];

/** Calcula a cor de borda do card conforme o valor do indicador. */
function alertColor(n) {
  if (n === 0)   return 'var(--green)';
  if (n <= 3)    return 'var(--amber)';
  return 'var(--red)';
}

function renderIndicatorCard(title, value, subtitle) {
  const color = alertColor(value);
  return `
    <div class="kpi-card" style="border-left:4px solid ${color}">
      <div class="kpi-label">${title}</div>
      <div class="kpi-value" style="color:${color}">${value}</div>
      <div class="kpi-sub">${subtitle}</div>
    </div>
  `;
}

function buildIndicators() {
  const capa       = db.get('capa')        || [];
  const rnc        = db.get('rnc')         || [];
  const reclamacoes= db.get('reclamacoes') || [];
  const auditorias = db.get('auditorias')  || [];
  const tecno      = db.get('tecno')       || [];
  const fornecedores = db.get('fornecedores') || [];

  const anoAtual = new Date().getFullYear();
  const anoStr   = String(anoAtual);

  const capaAbertas   = capa.filter(r => !CAPA_CLOSED.includes(r.status)).length;
  const rncAbertas    = rnc.filter(r => !RNC_CLOSED.includes(r.status)).length;
  const recAbertas    = reclamacoes.filter(r => r.status && r.status !== 'Encerrada' && r.status !== 'Cancelada' && r.status !== 'Fechada').length;

  const auditPlanejadas = auditorias.filter(r => {
    const ano = (r.dataRealizacao || r.dataPlanejada || r.data || '').slice(0, 4);
    return ano === anoStr;
  }).length;
  const auditConcluidas = auditorias.filter(r => {
    const ano = (r.dataRealizacao || r.dataPlanejada || r.data || '').slice(0, 4);
    return ano === anoStr && (r.status === 'Concluída' || r.status === 'Realizada');
  }).length;

  const tecnoAbertas  = tecno.filter(r => r.status === 'Aberto' || r.status === 'Em Investigação').length;
  const fornProblema  = fornecedores.filter(r => FORN_PROBLEM.includes(r.status)).length;

  return `
    <div class="kpi-grid" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr));margin-bottom:1.5rem">
      ${renderIndicatorCard('CAPA em Aberto',         capaAbertas,   'não encerradas')}
      ${renderIndicatorCard('RNC em Aberto',          rncAbertas,    'não encerradas')}
      ${renderIndicatorCard('Reclamações Abertas',    recAbertas,    'pendentes de tratamento')}
      ${renderIndicatorCard(`Auditorias ${anoAtual}`, auditConcluidas, `concluídas de ${auditPlanejadas} planejadas`)}
      ${renderIndicatorCard('Tecnovigilância',        tecnoAbertas,  'abertas ou em investigação')}
      ${renderIndicatorCard('Fornecedores c/ Problema', fornProblema, 'suspensos ou desqualificados')}
    </div>
    <p style="font-size:0.78rem;color:var(--muted);margin-bottom:1.5rem;font-style:italic">
      Dados atualizados em tempo real a partir dos módulos CAPA, RNC, Reclamações, Auditorias, Tecnovigilância e Fornecedores.
    </p>
  `;
}

function renderAtasTable(atas) {
  if (!atas.length) return emptyState('Nenhuma reunião registrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Tipo</th>
            <th>Participantes</th>
            <th>Deliberações</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${atas.map(r => `
            <tr>
              <td>${formatDate(r.dataReuniao)}</td>
              <td>${r.tipo}</td>
              <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.participantes || ''}">${r.participantes || '—'}</td>
              <td style="max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.deliberacoes || ''}">${r.deliberacoes || '—'}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getSortedAtas() {
  return (db.get('revisaoGerencialAtas') || [])
    .slice()
    .sort((a, b) => (b.dataReuniao || '').localeCompare(a.dataReuniao || ''));
}

function refreshAtas(container) {
  container.querySelector('#rg-atas-wrap').innerHTML = renderAtasTable(getSortedAtas());
}

function refreshIndicators(container) {
  container.querySelector('#rg-indicators').innerHTML = buildIndicators();
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Revisão Gerencial</h2>
        <button class="btn btn-primary" data-action="new-ata">+ Registrar Reunião</button>
      </div>

      <div id="rg-indicators">
        ${buildIndicators()}
      </div>

      <div class="card">
        <div class="card-header"><h3>Histórico de Reuniões</h3></div>
        <div class="card-body" style="padding:0">
          <div id="rg-atas-wrap">
            ${renderAtasTable(getSortedAtas())}
          </div>
        </div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new-ata') {
        openModal({
          title: 'Registrar Reunião de Revisão Gerencial',
          fields: FIELDS_ATA,
          data: {},
          onSave: data => {
            db.add('revisaoGerencialAtas', { ...data, id: Date.now() });
            toast('Reunião registrada!');
            refreshAtas(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('revisaoGerencialAtas', numId);
        if (!record) return;
        openModal({
          title: 'Editar Ata de Reunião',
          fields: FIELDS_ATA,
          data: record,
          onSave: data => {
            db.update('revisaoGerencialAtas', numId, data);
            toast('Ata atualizada!');
            refreshAtas(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta ata de reunião?').then(ok => {
          if (!ok) return;
          db.remove('revisaoGerencialAtas', numId);
          toast('Ata excluída.', 'warning');
          refreshAtas(container);
        });
      }
    });

    // Recarrega os indicadores ao voltar ao módulo (sem reload de página)
    refreshIndicators(container);
  },
};
