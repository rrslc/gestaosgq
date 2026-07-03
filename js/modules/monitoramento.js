/**
 * @fileoverview Monitoramento da Fábrica — Pragas, Reservatório, Resíduos e Microbiológico.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const TIPOS_PRAGA = [
  'Dedetização e Desratização',
  'Monitoramento com Armadilhas',
  'Desinsetização',
  'Descupinização',
  'Sanitização Ambiental',
  'Controle Integrado de Pragas',
  'Outros',
];

const TIPOS_RESIDUO = [
  'RSS Grupo A — Biológico',
  'RSS Grupo B — Químico',
  'RSS Grupo D — Comum',
  'RSS Grupo E — Perfurocortante',
  'Resíduo Químico Industrial',
  'Resíduo Eletrônico (REEE)',
  'Resíduo Comum Reciclável',
];

const STATUS_SERVICO  = ['Agendado', 'Realizado', 'Pendente Laudo', 'Concluído', 'Vencido', 'Cancelado'];
const STATUS_RESIDUO  = ['Agendado', 'Coletado', 'Pendente MTR', 'Concluído', 'Cancelado'];
const RESULTADO_AGUA  = ['Aprovado', 'Reprovado', 'Pendente', 'Não realizado'];
const SIM_NAO         = ['Sim', 'Não', 'Pendente'];

const AREAS_MICRO = ['Sala Limpa', 'Sala de Produção Inferior', 'Sala Limpa + Produção Inferior'];

const AREAS_LIMPEZA = ['Sala Limpa', 'Sala de Produção Inferior', 'Áreas Adjacentes', 'Sala Limpa + Produção Inferior', 'Todas as Áreas'];
const TIPOS_LIMPEZA = ['Limpeza de Rotina', 'Limpeza Terminal', 'Desinfecção', 'Sanitização', 'Limpeza e Desinfecção'];
const STATUS_LIMPEZA = ['Agendado', 'Realizado', 'Pendente Registro', 'Concluído', 'Cancelado'];
const METODOS_COLETA = ['Sedimentação (Placa Exposta)', 'Impactação (RCS / Impactador)', 'Swab de Superfície', 'Filtração de Ar', 'Combinado'];
const RESULTADO_MICRO = ['Aprovado — dentro do limite', 'Reprovado — fora do limite', 'Pendente', 'Inconclusivo'];

// ── Status computado por data ─────────────────────────────────────────────────

function statusFromDate(item, campoProxima) {
  if (['Cancelado', 'Pendente Laudo'].includes(item.status)) return item.status;
  const prox = item[campoProxima];
  if (!prox) return item.status || 'Realizado';
  const diff = (new Date(prox + 'T12:00:00') - new Date()) / 86400000;
  if (diff < 0) return 'Vencido';
  if (diff <= 30) return 'A Vencer';
  return 'Concluído';
}

// ── Fields ────────────────────────────────────────────────────────────────────

const FIELDS_PRAGA = [
  { id: 'numero',         label: 'Nº do Serviço',        type: 'text',     required: true,  span: 1 },
  { id: 'area',           label: 'Área(s) Atendida(s)',  type: 'text',     required: true,  span: 1 },
  { id: 'empresa',        label: 'Empresa Prestadora',   type: 'text',     required: true,  span: 2 },
  { id: 'tipo',           label: 'Tipo de Serviço',      type: 'select',   required: true,  span: 1, options: TIPOS_PRAGA },
  { id: 'status',         label: 'Status',               type: 'select',   required: true,  span: 1, options: STATUS_SERVICO },
  { id: 'dataRealizacao', label: 'Data de Realização',   type: 'date',     required: false, span: 1 },
  { id: 'proxima',        label: 'Próximo Serviço',      type: 'date',     required: false, span: 1 },
  { id: 'laudo',          label: 'Laudo / Certificado',  type: 'select',   required: false, span: 1, options: SIM_NAO },
  { id: 'obs',            label: 'Observações',           type: 'textarea', required: false, span: 2 },
];

const FIELDS_RESERVATORIO = [
  { id: 'numero',         label: 'Nº do Serviço',        type: 'text',     required: true,  span: 1 },
  { id: 'responsavel',    label: 'Responsável / Empresa', type: 'text',    required: true,  span: 1 },
  { id: 'volume',         label: 'Volume do Reservatório', type: 'text',   required: false, span: 1 },
  { id: 'status',         label: 'Status',                type: 'select',  required: true,  span: 1, options: STATUS_SERVICO },
  { id: 'dataRealizacao', label: 'Data da Limpeza',       type: 'date',    required: false, span: 1 },
  { id: 'proxima',        label: 'Próxima Limpeza',       type: 'date',    required: false, span: 1 },
  { id: 'resultadoAgua',  label: 'Resultado da Análise',  type: 'select',  required: false, span: 1, options: RESULTADO_AGUA },
  { id: 'laudo',          label: 'Laudo / Certificado',   type: 'select',  required: false, span: 1, options: SIM_NAO },
  { id: 'obs',            label: 'Observações',            type: 'textarea', required: false, span: 2 },
];

const FIELDS_RESIDUO = [
  { id: 'tipo',      label: 'Tipo de Resíduo',     type: 'select',   required: true,  span: 2, options: TIPOS_RESIDUO },
  { id: 'empresa',   label: 'Empresa Coletora',    type: 'text',     required: true,  span: 1 },
  { id: 'status',    label: 'Status',               type: 'select',   required: true,  span: 1, options: STATUS_RESIDUO },
  { id: 'dataColeta',label: 'Data da Coleta',       type: 'date',     required: false, span: 1 },
  { id: 'quantidade',label: 'Quantidade / Peso',    type: 'text',     required: false, span: 1 },
  { id: 'mtr',       label: 'Nº MTR / Manifesto',  type: 'text',     required: false, span: 1 },
  { id: 'obs',       label: 'Observações',           type: 'textarea', required: false, span: 2 },
];

const FIELDS_LIMPEZA = [
  { id: 'numero',         label: 'Nº do Registro',        type: 'text',     required: true,  span: 1 },
  { id: 'area',           label: 'Área Higienizada',       type: 'select',   required: true,  span: 1, options: AREAS_LIMPEZA },
  { id: 'responsavel',    label: 'Responsável',            type: 'text',     required: true,  span: 2 },
  { id: 'tipo',           label: 'Tipo de Limpeza',        type: 'select',   required: true,  span: 1, options: TIPOS_LIMPEZA },
  { id: 'status',         label: 'Status',                 type: 'select',   required: true,  span: 1, options: STATUS_LIMPEZA },
  { id: 'dataRealizacao', label: 'Data de Realização',     type: 'date',     required: false, span: 1 },
  { id: 'proxima',        label: 'Próxima Limpeza',        type: 'date',     required: false, span: 1 },
  { id: 'procedimento',   label: 'Procedimento Utilizado (POP)', type: 'text', required: false, span: 1 },
  { id: 'produto',        label: 'Produto(s) Utilizado(s)', type: 'text',    required: false, span: 1 },
  { id: 'obs',            label: 'Observações',             type: 'textarea', required: false, span: 2 },
];

// ── Tabelas ───────────────────────────────────────────────────────────────────

function renderTabelaPragas(items) {
  if (!items.length) return emptyState('Nenhum registro de controle de pragas.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Área</th><th>Empresa</th><th>Tipo</th>
        <th>Realização</th><th>Próximo</th><th>Laudo</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td>${r.area}</td>
            <td>${r.empresa}</td>
            <td style="font-size:0.82rem">${r.tipo}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataRealizacao)}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td style="font-size:0.8rem;text-align:center">${r.laudo || '—'}</td>
            <td>${statusPill(s)}</td>
            <td><div class="td-actions">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaReservatorio(items) {
  if (!items.length) return emptyState('Nenhum registro de limpeza de reservatório.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Responsável / Empresa</th><th>Volume</th>
        <th>Realização</th><th>Próxima</th><th>Análise da Água</th><th>Laudo</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          const cor = r.resultadoAgua === 'Aprovado' ? '#059669'
                    : r.resultadoAgua === 'Reprovado' ? '#dc2626' : '#d97706';
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td>${r.responsavel}</td>
            <td style="font-size:0.82rem">${r.volume || '—'}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataRealizacao)}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td style="font-size:0.82rem;font-weight:600;color:${cor}">${r.resultadoAgua || '—'}</td>
            <td style="font-size:0.8rem;text-align:center">${r.laudo || '—'}</td>
            <td>${statusPill(s)}</td>
            <td><div class="td-actions">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaResiduos(items) {
  if (!items.length) return emptyState('Nenhum registro de gerenciamento de resíduos.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Tipo de Resíduo</th><th>Empresa Coletora</th>
        <th>Data da Coleta</th><th>Quantidade</th><th>MTR / Manifesto</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => `<tr>
          <td style="font-size:0.82rem;max-width:220px">${r.tipo}</td>
          <td>${r.empresa}</td>
          <td style="font-size:0.82rem">${formatDate(r.dataColeta)}</td>
          <td style="font-size:0.82rem">${r.quantidade || '—'}</td>
          <td style="font-family:monospace;font-size:0.8rem">${r.mtr || '—'}</td>
          <td>${statusPill(r.status)}</td>
          <td><div class="td-actions">
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
          </div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

const FIELDS_MICRO = [
  { id: 'numero',         label: 'Nº do Relatório / Serviço', type: 'text',     required: true,  span: 1 },
  { id: 'empresa',        label: 'Empresa Prestadora',        type: 'text',     required: true,  span: 1 },
  { id: 'areaMicro',      label: 'Área Monitorada',           type: 'select',   required: true,  span: 1, options: AREAS_MICRO },
  { id: 'status',         label: 'Status',                    type: 'select',   required: true,  span: 1, options: STATUS_SERVICO },
  { id: 'dataColeta',     label: 'Data da Coleta',            type: 'date',     required: false, span: 1 },
  { id: 'proxima',        label: 'Próxima Coleta (mensal)',   type: 'date',     required: false, span: 1 },
  { id: 'metodoColeta',   label: 'Método de Coleta',          type: 'select',   required: false, span: 1, options: METODOS_COLETA },
  { id: 'resultado',      label: 'Resultado da Análise',      type: 'select',   required: false, span: 1, options: RESULTADO_MICRO },
  { id: 'limiteAceitavel',label: 'Limite Aceitável (ex: ≤ 100 UFC/m³)', type: 'text', required: false, span: 1 },
  { id: 'valorEncontrado',label: 'Valor Encontrado',          type: 'text',     required: false, span: 1 },
  { id: 'laudo',          label: 'Laudo disponível',          type: 'select',   required: false, span: 1, options: SIM_NAO },
  { id: 'obs',            label: 'Observações / Ações Corretivas', type: 'textarea', required: false, span: 2 },
];

function renderTabelaMicro(items) {
  if (!items.length) return emptyState('Nenhum registro de monitoramento microbiológico.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Empresa</th><th>Área</th><th>Método</th>
        <th>Coleta</th><th>Próxima</th><th>Resultado</th><th>Valor / Limite</th><th>Laudo</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          const aprovado = r.resultado?.startsWith('Aprovado');
          const reprovado = r.resultado?.startsWith('Reprovado');
          const corRes = aprovado ? '#059669' : reprovado ? '#dc2626' : '#d97706';
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.82rem">${r.empresa}</td>
            <td style="font-size:0.82rem">${r.areaMicro || '—'}</td>
            <td style="font-size:0.78rem;color:var(--muted)">${r.metodoColeta || '—'}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataColeta)}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td style="font-size:0.78rem;font-weight:600;color:${corRes};max-width:140px">${r.resultado || '—'}</td>
            <td style="font-size:0.78rem">
              ${r.valorEncontrado ? `<div>${r.valorEncontrado}</div>` : ''}
              ${r.limiteAceitavel ? `<div style="color:var(--muted)">Lim: ${r.limiteAceitavel}</div>` : '—'}
            </td>
            <td style="font-size:0.8rem;text-align:center">${r.laudo || '—'}</td>
            <td>${statusPill(s)}</td>
            <td><div class="td-actions">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaLimpeza(items) {
  if (!items.length) return emptyState('Nenhum registro de limpeza mensal.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Área</th><th>Responsável</th><th>Tipo</th>
        <th>Realização</th><th>Próxima</th><th>Procedimento</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.82rem">${r.area || '—'}</td>
            <td>${r.responsavel}</td>
            <td style="font-size:0.82rem">${r.tipo || '—'}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataRealizacao)}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td style="font-size:0.78rem;color:var(--muted)">${r.procedimento || '—'}</td>
            <td>${statusPill(s)}</td>
            <td><div class="td-actions">
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
            </div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

// ── Área config ───────────────────────────────────────────────────────────────

const AREAS = [
  {
    key: 'pragas',
    label: 'Controle de Pragas',
    col: 'pragas',
    fields: FIELDS_PRAGA,
    statusOpts: STATUS_SERVICO,
    renderTabela: renderTabelaPragas,
    filtro: (r, q) => (r.numero||r.area||r.empresa||'').toLowerCase().includes(q),
    statusFn: r => statusFromDate(r, 'proxima'),
  },
  {
    key: 'reservatorio',
    label: 'Limpeza de Reservatório',
    col: 'reservatorio',
    fields: FIELDS_RESERVATORIO,
    statusOpts: STATUS_SERVICO,
    renderTabela: renderTabelaReservatorio,
    filtro: (r, q) => (r.numero + (r.responsavel||'')).toLowerCase().includes(q),
    statusFn: r => statusFromDate(r, 'proxima'),
  },
  {
    key: 'residuos',
    label: 'Gerenc. de Resíduos',
    col: 'residuos',
    fields: FIELDS_RESIDUO,
    statusOpts: STATUS_RESIDUO,
    renderTabela: renderTabelaResiduos,
    filtro: (r, q) => ((r.tipo||'') + (r.empresa||'') + (r.mtr||'')).toLowerCase().includes(q),
    statusFn: r => r.status,
  },
  {
    key: 'microbiologico',
    label: 'Monit. Microbiológico',
    col: 'microbiologico',
    fields: FIELDS_MICRO,
    statusOpts: STATUS_SERVICO,
    renderTabela: renderTabelaMicro,
    filtro: (r, q) => ((r.numero||'') + (r.empresa||'') + (r.areaMicro||'')).toLowerCase().includes(q),
    statusFn: r => statusFromDate(r, 'proxima'),
  },
  {
    key: 'limpezaMensal',
    label: 'Limpeza Mensal',
    col: 'limpezaMensal',
    fields: FIELDS_LIMPEZA,
    statusOpts: STATUS_LIMPEZA,
    renderTabela: renderTabelaLimpeza,
    filtro: (r, q) => ((r.numero||'') + (r.area||'') + (r.responsavel||'')).toLowerCase().includes(q),
    statusFn: r => statusFromDate(r, 'proxima'),
  },
];

let _areaAtual = 'pragas';

function getArea() { return AREAS.find(a => a.key === _areaAtual); }

// ── Renderização da tabela com filtros ────────────────────────────────────────

function renderContent(container) {
  const area   = getArea();
  const search = (container.querySelector('[data-filter="search"]')?.value || '').toLowerCase();
  const statusF = container.querySelector('[data-filter="status"]')?.value || '';

  let items = db.get(area.col);
  if (search)  items = items.filter(r => area.filtro(r, search));
  if (statusF) items = items.filter(r => area.statusFn(r) === statusF);

  container.querySelector('#mon-table-wrap').innerHTML = area.renderTabela(items);
}

// ── Render principal ──────────────────────────────────────────────────────────

function renderMain(container) {
  const areaStyle = k =>
    `padding:6px 18px;border-radius:6px;border:none;cursor:pointer;font-size:0.82rem;font-weight:600;` +
    (_areaAtual === k
      ? 'background:var(--blue-light);color:#fff;'
      : 'background:transparent;color:var(--muted);');

  const area = getArea();

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Monitoramento da Fábrica</h2>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">
          Controle de pragas · Limpeza de reservatório · Gerenciamento de resíduos
        </div>
      </div>
      <button class="btn btn-primary" data-action="new">+ Novo Registro</button>
    </div>

    <div style="display:flex;gap:0;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;width:fit-content;margin-bottom:14px">
      ${AREAS.map(a => {
        const n = db.get(a.col).length;
        return `<button data-area-btn="${a.key}" style="${areaStyle(a.key)}">
          ${a.label}${n > 0
            ? `&nbsp;<span style="background:${_areaAtual === a.key ? 'rgba(255,255,255,0.3)' : '#9ca3af'};color:#fff;border-radius:10px;padding:0 6px;font-size:0.7rem">${n}</span>`
            : ''}
        </button>`;
      }).join('')}
    </div>

    <div class="toolbar">
      <input class="toolbar-search" type="text" placeholder="Buscar…" data-filter="search">
      <select class="toolbar-select" data-filter="status">
        <option value="">Todos os status</option>
        ${area.statusOpts.map(s => `<option value="${s}">${s}</option>`).join('')}
      </select>
    </div>

    <div class="card">
      <div id="mon-table-wrap"></div>
    </div>
  `;

  renderContent(container);
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    _areaAtual = 'pragas';
    renderMain(container);
  },

  init(container) {
    container.addEventListener('click', e => {
      const areaBtn = e.target.closest('[data-area-btn]');
      if (areaBtn) {
        _areaAtual = areaBtn.dataset.areaBtn;
        renderMain(container);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;
      const area  = getArea();

      if (action === 'new') {
        openModal({
          title: `Novo Registro — ${area.label}`,
          fields: area.fields,
          data: {},
          onSave: data => {
            db.add(area.col, data);
            toast('Registro criado!');
            renderContent(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById(area.col, numId);
        if (!record) return;
        openModal({
          title: `Editar — ${area.label}`,
          fields: area.fields,
          data: record,
          onSave: data => {
            db.update(area.col, numId, data);
            toast('Registro atualizado!');
            renderContent(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir este registro?').then(ok => {
          if (!ok) return;
          db.remove(area.col, numId);
          toast('Registro excluído.', 'warning');
          renderContent(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) renderContent(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) renderContent(container); });
  },
};
