/**
 * @fileoverview RNC — Abertura: fluxo conforme POP-GQ-008 (Gestão de Não Conformidades).
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, TIPOS_NC, CLASSIFICACOES_RNC, FERRAMENTAS_INVEST, DISPOSICOES_NC } from '../constants.js';

const AREAS      = ['GQ', 'Produção', 'P&D', 'Regulatório', 'Logística', 'Compras', 'RH', 'TI', 'Fábrica', 'Outros'];
const RISK_LEVEL  = ['Baixa', 'Média', 'Alta'];
const PERIOD_VER  = ['3 meses', '6 meses', '9 meses', '12 meses'];
const CLOSED      = ['Encerrada', 'Cancelada', 'Não Procedente'];

// Ordem das etapas do fluxo POP-GQ-008
const STAGE_ORDER = [
  'Aberta',
  'Em Avaliação',
  'Em Investigação',
  'Em Plano de Ação',
  'Verificação de Eficácia',
  'Encerrada',
];

function currentStageIdx(status) {
  const i = STAGE_ORDER.indexOf(status);
  if (i >= 0) return i;
  if (status === 'Não Procedente') return 1; // encerrou na avaliação GQ
  return STAGE_ORDER.length;                  // Cancelada → tudo bloqueado
}

const PIPELINE = [
  { key: 'Aberta',                   label: 'Aberta',        color: 'var(--red)'    },
  { key: 'Em Avaliação',             label: 'Avaliação',     color: 'var(--purple)' },
  { key: 'Em Investigação',          label: 'Investigação',  color: 'var(--blue)'   },
  { key: 'Em Plano de Ação',        label: 'Plano de Ação', color: 'var(--amber)'  },
  { key: 'Verificação de Eficácia', label: 'Verificação',   color: 'var(--teal)'   },
  { key: 'Encerrada',               label: 'Encerrada',     color: 'var(--green)'  },
];

// Matriz Probabilidade × Severidade → Risco (POP-GQ-008 §7.2.2)
const RISK_MATRIX = {
  'Alta':  { 'Baixa': 'Maior',  'Média': 'Crítica', 'Alta': 'Crítica' },
  'Média': { 'Baixa': 'Menor',  'Média': 'Maior',   'Alta': 'Crítica' },
  'Baixa': { 'Baixa': 'Menor',  'Média': 'Menor',   'Alta': 'Maior'   },
};

const NEXT_STATUS = {
  'Aberta':                    'Em Avaliação',
  'Em Avaliação':              'Em Investigação',
  'Em Investigação':           'Em Plano de Ação',
  'Em Plano de Ação':         'Verificação de Eficácia',
  'Verificação de Eficácia':  'Encerrada',
};

let _router = null;
async function getRouter() {
  if (!_router) { const m = await import('../app.js'); _router = m.router; }
  return _router;
}

function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const all = db.get('rnc');
  const seq = all.filter(r => (r.numero || '').endsWith(`/${yy}`)).length + 1;
  return `RNC.${String(seq).padStart(3, '0')}/${yy}`;
}

function calcRisco(probabilidade, severidade) {
  return RISK_MATRIX[probabilidade]?.[severidade] ?? '';
}

/**
 * Constrói os campos do formulário respeitando o fluxo POP-GQ-008.
 * Etapas já concluídas ficam somente-leitura; etapas futuras não aparecem.
 * @param {Object|null} record — registro existente ou null para nova RNC
 */
function buildFields(record = null) {
  const nomes  = db.get('equipe').map(m => m.nome);
  const resp   = nomes.length ? nomes : ['—'];
  const status = record?.status ?? 'Aberta';
  const curIdx = currentStageIdx(status);
  const isTerminal = ['Não Procedente', 'Cancelada'].includes(status);

  // Aplica readonly se a etapa já passou (ou se é estado terminal)
  function f(stageKey, fieldDef) {
    const si = STAGE_ORDER.indexOf(stageKey);
    return (isTerminal || si < curIdx) ? { ...fieldDef, readonly: true } : fieldDef;
  }

  // Cabeçalho de seção com indicação de bloqueio
  function h(label, stageKey) {
    const si = STAGE_ORDER.indexOf(stageKey);
    return { id: `_h_${stageKey}`, type: 'heading', label, locked: isTerminal || si < curIdx, span: 2 };
  }

  // ── ETAPA 1 — Abertura (Área) ─────────────────────────────────────────────
  const base = [
    f('Aberta', { id: 'numero',              label: '1.1  Nº RNC',                                              type: 'text',     required: true,  span: 1, readonly: true }),
    f('Aberta', { id: 'dataAbertura',        label: '1.2  Data de Abertura',                                    type: 'date',     required: true,  span: 1 }),
    f('Aberta', { id: 'responsavel',         label: '1.3  Responsável pela Abertura',                           type: 'select',   required: true,  span: 1, options: resp }),
    f('Aberta', { id: 'area',               label: '1.4  Área',                                                type: 'select',   required: true,  span: 1, options: AREAS }),
    f('Aberta', { id: 'tipo',               label: '1.5  Tipo de NC',                                          type: 'select',   required: true,  span: 2, options: TIPOS_NC }),
    f('Aberta', { id: 'produto',            label: 'Nome / Produto / Processo / Equipamento',                   type: 'text',     required: false, span: 2 }),
    f('Aberta', { id: 'lote',              label: 'Lote',                                                      type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'dataFabricacao',    label: 'Data de Fabricação',                                        type: 'date',     required: false, span: 1 }),
    f('Aberta', { id: 'dataValidade',      label: 'Data de Validade',                                          type: 'date',     required: false, span: 1 }),
    f('Aberta', { id: 'codigoEquipamento', label: 'Código do Equipamento',                                      type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'numeroREC',         label: 'Nº REC  (Reclamação de Cliente)',                            type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'especificar',       label: 'Especificar  (Processos / Docs / Outros)',                   type: 'text',     required: false, span: 2 }),
    f('Aberta', { id: 'descricao',         label: '1.6  Descrição da Ocorrência / Identificação do Problema',  type: 'textarea', required: true,  span: 2 }),
    f('Aberta', { id: 'abrangencia',       label: '2.  Abrangência',
      type: 'select', required: false, span: 2,
      options: ['Outro(s) Produto(s)', 'Outro(s) Lote(s)', 'Outra(s) Máquina(s)',
                'Outro(s) Dispositivo(s) de Medição', 'Outro(s) Documento(s)', 'Não se aplica', 'Outro(s)'] }),
    f('Aberta', { id: 'abrangenciaEspecificar', label: '    Especificar Abrangência',                           type: 'text',     required: false, span: 2 }),
    f('Aberta', { id: 'acoesImediatas',    label: '3.  Ações de Contenção / Imediatas',                         type: 'acoes-table', required: false, span: 2 }),
  ];

  // Para nova RNC: só etapa 1, sem cabeçalhos de seção
  if (!record) return base;

  const fields = [h('ETAPA 1 — ABERTURA  (Área)', 'Aberta'), ...base];

  // ── ETAPA 2 — Avaliação pela GQ (Seções 4–5) ─────────────────────────────
  if (curIdx >= 1) {
    fields.push(
      h('ETAPA 2 — AVALIAÇÃO  (GQ)', 'Em Avaliação'),
      f('Em Avaliação', { id: 'recorrencia',       label: '4.1  Recorrência (últimos 2 anos)?',               type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Em Avaliação', { id: 'rncAnterior',       label: '      RNCs anteriores (se recorrente)',             type: 'text',     required: false, span: 2 }),
      f('Em Avaliação', { id: 'severidade',        label: '4.2  Severidade',                                  type: 'select',   required: false, span: 1, options: RISK_LEVEL }),
      f('Em Avaliação', { id: 'probabilidade',     label: '      Probabilidade',                              type: 'select',   required: false, span: 1, options: RISK_LEVEL }),
      f('Em Avaliação', { id: 'classificacaoRisco',label: '      Risco  (Prob × Sev)',                         type: 'text',     required: false, span: 1, readonly: true }),
      f('Em Avaliação', { id: 'procedente',        label: '5.   Procedente?',                                 type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Em Avaliação', { id: 'classificacao',     label: '      Classificação',                              type: 'select',   required: false, span: 1, options: ['Menor', 'Maior', 'Crítica'] }),
      f('Em Avaliação', { id: 'justificativaNP',   label: '      Justificativa (Não Procedente)',              type: 'textarea', required: false, span: 2 }),
      f('Em Avaliação', { id: 'prazoInvestigacao', label: '      Prazo Investigação (D+15)',                   type: 'date',     required: false, span: 1 }),
    );
  }

  // ── ETAPA 3 — Investigação (Seções 6–10) ─────────────────────────────────
  if (curIdx >= 2) {
    fields.push(
      h('ETAPA 3 — INVESTIGAÇÃO  (Equipe / GQ)', 'Em Investigação'),
      f('Em Investigação', { id: 'liderInvestigacao',      label: '6.   Líder da Investigação',               type: 'select',   required: false, span: 1, options: resp }),
      f('Em Investigação', { id: 'equipeInvestigacao',     label: '      Equipe de Investigação',             type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'fontesInformacao',       label: '7.   Fonte de Informações / Dados',        type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'resumoInvestigacao',     label: '8.   Resumo da Investigação',              type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'porques',                label: '9.1  5 Porquês',                           type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'ferramentasInvestigacao',label: '9.2  Outras Ferramentas da Qualidade',     type: 'select',   required: false, span: 1, options: FERRAMENTAS_INVEST }),
      f('Em Investigação', { id: 'causaRaiz',              label: '9.3  Causa(s) Raiz(ízes)',                 type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'observacoes',            label: '10.  Observação',                          type: 'textarea', required: false, span: 2 }),
    );
  }

  // ── ETAPA 4 — Plano de Ação / Disposição (GQ + MC) ───────────────────────
  if (curIdx >= 3) {
    fields.push(
      h('ETAPA 4 — PLANO DE AÇÃO  (GQ / MC)', 'Em Plano de Ação'),
      f('Em Plano de Ação', { id: 'disposicao',              label: 'Disposição',                             type: 'select',   required: false, span: 1, options: DISPOSICOES_NC }),
      f('Em Plano de Ação', { id: 'numFormularioRetrabalho', label: 'Nº Formulário de Retrabalho',            type: 'text',     required: false, span: 1 }),
      f('Em Plano de Ação', { id: 'necessitaCapa',           label: 'Necessita CAPA?',                        type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
      f('Em Plano de Ação', { id: 'prazoFinalizacao',        label: 'Prazo de Finalização do Plano',          type: 'date',     required: false, span: 1 }),
    );
  }

  // ── ETAPA 5 — Verificação de Eficácia (3–12 meses) ───────────────────────
  if (curIdx >= 4) {
    fields.push(
      h('ETAPA 5 — VERIFICAÇÃO DE EFICÁCIA  (GQ)', 'Verificação de Eficácia'),
      f('Verificação de Eficácia', { id: 'periodoVerificacao',    label: 'Período de Verificação',            type: 'select',   required: false, span: 1, options: PERIOD_VER }),
      f('Verificação de Eficácia', { id: 'dataInicioVerificacao', label: 'Início da Verificação',             type: 'date',     required: false, span: 1 }),
      f('Verificação de Eficácia', { id: 'resultadoVerificacao',  label: 'Resultado da Verificação',          type: 'textarea', required: false, span: 2 }),
      f('Verificação de Eficácia', { id: 'foiEficaz',             label: 'Foi Eficaz?',                       type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
    );
  }

  // ── ETAPA 6 — Encerramento (GQ) ───────────────────────────────────────────
  if (curIdx >= 5) {
    fields.push(
      h('ETAPA 6 — ENCERRAMENTO  (GQ)', 'Encerrada'),
      f('Encerrada', { id: 'alteracaoDocumentos', label: 'Houve alteração de docs. do SGQ?',    type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Encerrada', { id: 'codigosDocumentos',   label: 'Códigos dos documentos alterados',     type: 'text',     required: false, span: 2 }),
      f('Encerrada', { id: 'impactoMSB',          label: 'Houve impacto das ações para a MSB?', type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Encerrada', { id: 'descricaoImpacto',    label: 'Descrever o impacto',                  type: 'textarea', required: false, span: 2 }),
      f('Encerrada', { id: 'dataFechamento',       label: 'Data de Fechamento',                   type: 'date',     required: false, span: 1 }),
    );
  }

  return fields;
}

function renderPipelineBar(items) {
  const counts = {};
  PIPELINE.forEach(p => { counts[p.key] = 0; });
  const naoProc = items.filter(r => r.status === 'Não Procedente').length;
  items.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  return `
    <div style="display:flex;gap:0;margin-bottom:${naoProc ? '8px' : '20px'};border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${PIPELINE.map((p, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.4rem;font-weight:700;color:${p.color}">${counts[p.key]}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${p.label}</div>
        </div>
      `).join('')}
    </div>
    ${naoProc ? `<div style="margin-bottom:16px"><span style="font-size:0.78rem;padding:3px 12px;border-radius:12px;background:var(--border);color:var(--muted)">+ ${naoProc} Não Procedente${naoProc > 1 ? 's' : ''}</span></div>` : ''}
  `;
}

const RISK_PILL = { 'Menor': 'pill-blue', 'Maior': 'pill-amber', 'Crítica': 'pill-red' };

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma RNC encontrada.');

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const dias = Math.round((fim - ini) / 86400000);
    const emAtraso = !CLOSED.includes(r.status) && r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
    return `<span style="color:${emAtraso ? 'var(--red)' : 'inherit'};font-weight:${emAtraso ? '600' : 'normal'}">${dias}d</span>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Tipo</th><th>Descrição</th><th>Área</th>
          <th>Responsável</th><th>Abertura</th><th>T. Aberto</th>
          <th>Risco</th><th>Status</th><th>Eficácia</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const nextSt  = NEXT_STATUS[r.status];
            const capaBtn = r.necessitaCapa === 'Sim' && !r.capaAberta
              ? `<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" title="Abrir CAPA">📋</button>`
              : '';
            const npBtn = r.status === 'Em Avaliação'
              ? `<button class="btn btn-secondary btn-sm" data-action="nao-procedente" data-id="${r.id}" title="Marcar Não Procedente" style="color:var(--muted)">✕ NP</button>`
              : '';
            const risco = r.classificacaoRisco
              ? `<span class="pill ${RISK_PILL[r.classificacaoRisco] ?? 'pill-gray'}">${r.classificacaoRisco}</span>`
              : '—';
            const eficacia = r.foiEficaz
              ? statusPill(r.foiEficaz === 'Sim' ? 'Eficaz' : r.foiEficaz === 'Não' ? 'Ineficaz' : 'Em Avaliação')
              : '—';
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td style="white-space:nowrap;font-size:0.8rem">${r.tipo || '—'}</td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${r.area || '—'}</td>
              <td>${r.responsavel}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td style="text-align:center">${diasAberto(r)}</td>
              <td>${risco}</td>
              <td>${statusPill(r.encerradoStatus || r.status)}</td>
              <td>${eficacia}</td>
              <td>
                <div class="td-actions">
                  ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>` : ''}
                  ${npBtn}
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
                  ${capaBtn}
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function refresh(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  const tipo   = container.querySelector('[data-filter="tipo"]')?.value ?? '';
  const area   = container.querySelector('[data-filter="area"]')?.value ?? '';
  let items = db.get('rnc');
  if (search) items = items.filter(r =>
    (r.numero || '').toLowerCase().includes(search) ||
    (r.descricao || '').toLowerCase().includes(search) ||
    (r.produto || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (tipo)   items = items.filter(r => r.tipo === tipo);
  if (area)   items = items.filter(r => r.area === area);
  container.querySelector('#rnc-pipeline').innerHTML = renderPipelineBar(db.get('rnc'));
  container.querySelector('#rnc-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    const allRnc = db.get('rnc');
    container.innerHTML = `
      <div class="page-header">
        <h2>RNC — Abertura</h2>
        <button class="btn btn-primary" data-action="new">+ Nova RNC</button>
      </div>
      <div id="rnc-pipeline">${renderPipelineBar(allRnc)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, produto ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.RNC)}
        </select>
        <select class="toolbar-select" data-filter="tipo">
          <option value="">Todos os tipos</option>
          ${TIPOS_NC.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
        <select class="toolbar-select" data-filter="area">
          <option value="">Todas as áreas</option>
          ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div id="rnc-table-wrap">${renderTable(allRnc)}</div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, next } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new') {
        openModal({
          title: 'Nova RNC',
          fields: buildFields(null),
          data: { numero: generateNumero(), dataAbertura: today(), status: 'Aberta' },
          onSave: data => {
            db.add('rnc', { ...data, status: 'Aberta' });
            toast('RNC criada com sucesso!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        openModal({
          title: `Editar RNC ${record.numero}  —  ${record.status}`,
          fields: buildFields(record),
          data: record,
          setup(form) {
            const sevEl   = form.querySelector('#field-severidade');
            const probEl  = form.querySelector('#field-probabilidade');
            const riscoEl = form.querySelector('#field-classificacaoRisco');
            const clasEl  = form.querySelector('#field-classificacao');
            if (!sevEl || !probEl) return;
            const update = () => {
              const r = calcRisco(probEl.value, sevEl.value);
              if (riscoEl) riscoEl.value = r;
              // só preenche classificação se o campo não estiver bloqueado
              if (clasEl && clasEl.getAttribute('tabindex') !== '-1') clasEl.value = r;
            };
            sevEl.addEventListener('change', update);
            probEl.addEventListener('change', update);
          },
          onSave: data => {
            const risco = calcRisco(data.probabilidade, data.severidade);
            db.update('rnc', numId, { ...data, classificacaoRisco: risco || data.classificacaoRisco });
            toast('RNC atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        showConfirm(`Avançar esta RNC para "${next}"?`).then(ok => {
          if (!ok) return;
          const record = db.getById('rnc', numId);
          const updates = { status: next };
          if (next === 'Encerrada') {
            const dataFechamento = today();
            updates.dataFechamento = dataFechamento;
            if (record?.prazoFinalizacao) {
              updates.encerradoStatus = dataFechamento <= record.prazoFinalizacao
                ? 'Finalizado no prazo' : 'Finalizado em atraso';
            }
          }
          db.update('rnc', numId, updates);
          toast(`RNC avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'nao-procedente') {
        showConfirm('Marcar esta RNC como Não Procedente e encerrá-la?').then(ok => {
          if (!ok) return;
          db.update('rnc', numId, { status: 'Não Procedente', dataFechamento: today() });
          toast('RNC encerrada como Não Procedente.');
          refresh(container);
        });
      }

      if (action === 'abrir-capa') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        showConfirm(`Abrir uma CAPA a partir de ${record.numero}?`).then(async ok => {
          if (!ok) return;
          window._capaFromRNC = {
            origem: 'RNC/CAPA',
            descricao: `[RNC ${record.numero}] ${record.descricao}`,
            area: record.area || '',
          };
          db.update('rnc', numId, { capaAberta: true });
          const r = await getRouter();
          r.navigate('capaAbertura');
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta RNC?').then(ok => {
          if (!ok) return;
          db.remove('rnc', numId);
          toast('RNC excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
