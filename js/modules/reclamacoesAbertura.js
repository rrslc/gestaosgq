/**
 * @fileoverview Reclamações de Clientes — Abertura: fluxo conforme P-SQ-014.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today, deadlineCell } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { TIPOS_TECNO, STATUS } from '../constants.js';

const TIPOS_REC = [
  'Produto com defeito', 'Falha de embalagem', 'Problema de esterilidade',
  'Prazo de validade', 'Reação adversa', 'Documentação', 'Outros',
];

const CLOSED = ['Concluída', 'Cancelada'];

const STAGE_ORDER = ['Aberta', 'Em Investigação', 'Aguardando Retorno', 'Concluída'];

const PIPELINE = [
  { key: 'Aberta',             label: 'Aberta',      color: 'var(--red)'   },
  { key: 'Em Investigação',    label: 'Investigação', color: 'var(--blue)'  },
  { key: 'Aguardando Retorno', label: 'Ag. Retorno', color: 'var(--amber)' },
  { key: 'Concluída',          label: 'Concluída',   color: 'var(--green)' },
];

const NEXT_STATUS = {
  'Aberta':             'Em Investigação',
  'Em Investigação':    'Aguardando Retorno',
  'Aguardando Retorno': 'Concluída',
};

const ALL_STATUS = ['Aberta', 'Em Investigação', 'Aguardando Retorno', 'Concluída', 'Cancelada'];

function currentStageIdx(status) {
  const i = STAGE_ORDER.indexOf(status);
  return i >= 0 ? i : STAGE_ORDER.length;
}

function addDays(isoDate, days) {
  if (!isoDate) return '';
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const all = db.get('reclamacoes');
  const seq = all.filter(r => (r.numero || '').endsWith(`/${yy}`)).length + 1;
  return `REC.${String(seq).padStart(3, '0')}/${yy}`;
}

function buildFields(record = null) {
  const nomes = db.get('equipe').map(m => m.nome);
  const resp  = nomes.length ? nomes : ['—'];
  const status = record?.status ?? 'Aberta';
  const curIdx = currentStageIdx(status);
  const isTerminal = CLOSED.includes(status);

  function f(stageKey, fieldDef) {
    const si = STAGE_ORDER.indexOf(stageKey);
    return (isTerminal || si < curIdx) ? { ...fieldDef, readonly: true } : fieldDef;
  }

  function h(label, stageKey) {
    const si = STAGE_ORDER.indexOf(stageKey);
    return { id: `_h_${stageKey}`, type: 'heading', label, locked: isTerminal || si < curIdx, span: 2 };
  }

  // ── ETAPA 1 — Abertura ────────────────────────────────────────────────────
  const base = [
    f('Aberta', { id: 'numero',              label: '1.1  Nº Reclamação',                   type: 'text',     required: false, span: 1, readonly: true }),
    f('Aberta', { id: 'dataAbertura',        label: '1.2  Data de Abertura',                type: 'date',     required: true,  span: 1 }),
    f('Aberta', { id: 'responsavel',         label: '1.3  Responsável (GQ)',                type: 'select',   required: true,  span: 1, options: resp }),
    f('Aberta', { id: 'cliente',             label: '1.4  Cliente / Instituição',           type: 'text',     required: true,  span: 1 }),
    f('Aberta', { id: 'contato',             label: '1.5  Contato / Solicitante',           type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'email',               label: 'E-mail',                               type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'produto',             label: '1.6  Produto',                         type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'lote',                label: 'Lote',                                 type: 'text',     required: false, span: 1 }),
    f('Aberta', { id: 'descricao',           label: '1.7  Descrição da Reclamação',         type: 'textarea', required: true,  span: 2 }),
    f('Aberta', { id: 'tipo',                label: '1.8  Tipo de Reclamação',              type: 'select',   required: true,  span: 2, options: TIPOS_REC }),
    f('Aberta', { id: 'prazoContatoCliente', label: 'Prazo 1º Contato (≤ 72h úteis)',       type: 'date',     required: false, span: 1, readonly: true }),
    f('Aberta', { id: 'primeiroContato',     label: 'Data 1º Contato Realizado',            type: 'date',     required: false, span: 1 }),
    f('Aberta', { id: 'prazoRecebimento',    label: 'Prazo Recebimento Produto (≤ 15 dias)', type: 'date',    required: false, span: 1, readonly: true }),
    f('Aberta', { id: 'dataRecebimento',     label: 'Data Recebimento Produto',             type: 'date',     required: false, span: 1 }),
  ];

  if (!record) return base;

  const fields = [h('ETAPA 1 — ABERTURA  (Área / GQ)', 'Aberta'), ...base];

  // ── ETAPA 2 — Investigação ────────────────────────────────────────────────
  if (curIdx >= 1) {
    fields.push(
      h('ETAPA 2 — INVESTIGAÇÃO  (GQ)', 'Em Investigação'),
      f('Em Investigação', { id: 'liderInvestigacao', label: '2.1  Líder da Investigação',        type: 'select',   required: false, span: 1, options: resp }),
      f('Em Investigação', { id: 'investigacao',      label: '2.2  Resumo da Investigação',       type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'causaRaiz',         label: '2.3  Causa Raiz Identificada',      type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'geraRNC',           label: '2.4  Gera RNC?',                    type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
      f('Em Investigação', { id: 'numeroRNC',         label: 'Nº da RNC gerada',                  type: 'text',     required: false, span: 1 }),
      f('Em Investigação', { id: 'geraCAPA',          label: '2.5  Gera CAPA?',                        type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
      f('Em Investigação', { id: 'numeroCAPA',        label: 'Nº da CAPA gerada',                      type: 'text',     required: false, span: 1 }),
      f('Em Investigação', { id: 'geraTecnovig',      label: '2.6  Gera Notif. Tecnovigilância (ANVISA)?', type: 'select', required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
      f('Em Investigação', { id: 'numeroTecnovig',    label: 'Nº da Notificação ANVISA',               type: 'text',     required: false, span: 1, readonly: true }),
      f('Em Investigação', { id: 'prazoFechamento',   label: 'Prazo de Fechamento (≤ 90 dias)',        type: 'date',     required: false, span: 1, readonly: true }),
    );
  }

  // ── ETAPA 3 — Retorno ao Cliente ──────────────────────────────────────────
  if (curIdx >= 2) {
    fields.push(
      h('ETAPA 3 — RETORNO AO CLIENTE  (GQ)', 'Aguardando Retorno'),
      f('Aguardando Retorno', { id: 'cartaResposta',     label: '3.1  Carta Resposta ao Cliente',        type: 'textarea', required: false, span: 2 }),
      f('Aguardando Retorno', { id: 'dataEnvioResposta', label: '3.2  Data de Envio da Carta Resposta',  type: 'date',     required: false, span: 1 }),
    );
  }

  // ── ETAPA 4 — Encerramento ────────────────────────────────────────────────
  if (curIdx >= 3) {
    fields.push(
      h('ETAPA 4 — ENCERRAMENTO  (GQ)', 'Concluída'),
      f('Concluída', { id: 'resultado',      label: '4.1  Resultado',          type: 'select', required: false, span: 1, options: ['Procedente', 'Não Procedente', 'Parcialmente Procedente'] }),
      f('Concluída', { id: 'dataFechamento', label: '4.2  Data de Fechamento', type: 'date',   required: false, span: 1 }),
    );
  }

  return fields;
}

function renderPipelineBar(items) {
  const counts = {};
  PIPELINE.forEach(p => { counts[p.key] = 0; });
  items.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  return `
    <div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${PIPELINE.map((p, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.4rem;font-weight:700;color:${p.color}">${counts[p.key]}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${p.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma reclamação encontrada.');

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    return `${Math.round((fim - ini) / 86400000)}d`;
  }

  function rowStyle(r) {
    if (CLOSED.includes(r.status) || !r.prazoFechamento) return '';
    return new Date(r.prazoFechamento + 'T00:00:00') < hoje ? 'background:rgba(239,68,68,0.06)' : '';
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Tipo</th><th>Cliente</th><th>Produto</th>
          <th>Responsável</th><th>Abertura</th><th>T. Aberto</th>
          <th>1º Contato</th><th>Prazo 90d</th><th>Status</th><th>ANVISA</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const nextSt = NEXT_STATUS[r.status];
            const cancelBtn = !CLOSED.includes(r.status)
              ? `<button class="btn btn-secondary btn-sm" data-action="cancelar" data-id="${r.id}" title="Cancelar" style="color:var(--muted)">✕</button>`
              : '';
            let anvisaCell = '—';
            if (r.geraTecnovig === 'Sim' && r.numeroTecnovig) {
              anvisaCell = `<span class="pill pill-red" title="Notificação ANVISA vinculada">${r.numeroTecnovig}</span>`;
            } else if (r.geraTecnovig === 'Sim' && !CLOSED.includes(r.status)) {
              anvisaCell = `<button class="btn btn-secondary btn-sm" data-action="notificar-anvisa" data-id="${r.id}" title="Criar notificação ANVISA" style="white-space:nowrap;font-size:0.72rem">🔔 Notif. ANVISA</button>`;
            } else if (r.geraTecnovig === 'Em Avaliação') {
              anvisaCell = `<span class="pill pill-amber">Em Avaliação</span>`;
            }
            return `<tr style="${rowStyle(r)}">
              <td><strong>${r.numero}</strong></td>
              <td style="white-space:nowrap;font-size:0.8rem">${r.tipo || '—'}</td>
              <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.cliente || ''}">${r.cliente || '—'}</td>
              <td>${r.produto || '—'}</td>
              <td>${r.responsavel || '—'}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td style="text-align:center">${diasAberto(r)}</td>
              <td>${formatDate(r.primeiroContato)}</td>
              <td>${deadlineCell(r.prazoFechamento)}</td>
              <td>${statusPill(r.status)}</td>
              <td style="white-space:nowrap">${anvisaCell}</td>
              <td>
                <div class="td-actions">
                  ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>` : ''}
                  ${cancelBtn}
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
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
  let items = db.get('reclamacoes');
  if (search) items = items.filter(r =>
    (r.numero || '').toLowerCase().includes(search) ||
    (r.cliente || '').toLowerCase().includes(search) ||
    (r.produto || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (tipo)   items = items.filter(r => r.tipo === tipo);
  container.querySelector('#rec-pipeline').innerHTML = renderPipelineBar(db.get('reclamacoes'));
  container.querySelector('#rec-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    const all = db.get('reclamacoes');
    container.innerHTML = `
      <div class="page-header">
        <h2>Reclamações de Clientes — Abertura</h2>
        <button class="btn btn-primary" data-action="new">+ Nova Reclamação</button>
      </div>
      <div id="rec-pipeline">${renderPipelineBar(all)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, cliente ou produto…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${ALL_STATUS.map(s => `<option value="${s}">${s}</option>`).join('')}
        </select>
        <select class="toolbar-select" data-filter="tipo">
          <option value="">Todos os tipos</option>
          ${TIPOS_REC.map(t => `<option value="${t}">${t}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div id="rec-table-wrap">${renderTable(all)}</div>
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
        const dataHoje = today();
        openModal({
          title: 'Nova Reclamação',
          fields: buildFields(null),
          data: {
            numero: generateNumero(),
            dataAbertura: dataHoje,
            status: 'Aberta',
            prazoContatoCliente: dataHoje,
            prazoRecebimento: addDays(dataHoje, 15),
          },
          setup(form) {
            const dtEl      = form.querySelector('#field-dataAbertura');
            const prazoCtEl = form.querySelector('#field-prazoContatoCliente');
            const prazoReEl = form.querySelector('#field-prazoRecebimento');
            function updatePrazos() {
              const val = dtEl?.value;
              if (prazoCtEl) prazoCtEl.value = val || '';
              if (prazoReEl) prazoReEl.value = val ? addDays(val, 15) : '';
            }
            if (dtEl) dtEl.addEventListener('change', updatePrazos);
          },
          onSave: data => {
            const prazoFechamento = addDays(data.dataAbertura, 90);
            db.add('reclamacoes', { ...data, status: 'Aberta', prazoFechamento });
            toast('Reclamação criada com sucesso!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('reclamacoes', numId);
        if (!record) return;
        openModal({
          title: `Editar Reclamação ${record.numero}  —  ${record.status}`,
          fields: buildFields(record),
          data: record,
          onSave: data => {
            db.update('reclamacoes', numId, data);
            toast('Reclamação atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        showConfirm(`Avançar esta reclamação para "${next}"?`).then(ok => {
          if (!ok) return;
          const updates = { status: next };
          if (next === 'Concluída') updates.dataFechamento = today();
          db.update('reclamacoes', numId, updates);
          toast(`Reclamação avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'cancelar') {
        showConfirm('Cancelar esta reclamação?').then(ok => {
          if (!ok) return;
          db.update('reclamacoes', numId, { status: 'Cancelada', dataFechamento: today() });
          toast('Reclamação cancelada.', 'warning');
          refresh(container);
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta reclamação?').then(ok => {
          if (!ok) return;
          db.remove('reclamacoes', numId);
          toast('Reclamação excluída.', 'warning');
          refresh(container);
        });
      }

      if (action === 'notificar-anvisa') {
        const rec = db.getById('reclamacoes', numId);
        if (!rec) return;
        const allTecno = db.get('tecno');
        const yy = String(new Date().getFullYear()).slice(2);
        const seqTecno = allTecno.filter(t => (t.numero || '').includes(`/TEC/${yy}`)).length + 1;
        const novoNumero = `NOT.${String(seqTecno).padStart(3, '0')}/TEC/${yy}`;
        const FIELDS_TECNO = [
          { id: 'numero',           label: 'Número',                     type: 'text',     required: true,  span: 1 },
          { id: 'tipo',             label: 'Tipo',                       type: 'select',   required: true,  span: 1, options: TIPOS_TECNO },
          { id: 'produto',          label: 'Produto',                    type: 'text',     required: true,  span: 2 },
          { id: 'descricao',        label: 'Descrição',                  type: 'textarea', required: true,  span: 2 },
          { id: 'data',             label: 'Data de Abertura',           type: 'date',     required: true,  span: 1 },
          { id: 'prazoAnvisa',      label: 'Prazo ANVISA',               type: 'date',     required: false, span: 1 },
          { id: 'status',           label: 'Status',                     type: 'select',   required: true,  span: 2, options: STATUS.TECNO },
          { id: 'reclamacaoOrigem', label: 'Reclamação de Origem',       type: 'text',     required: false, span: 1, readonly: true },
        ];
        openModal({
          title: `Nova Notificação ANVISA — originada de ${rec.numero}`,
          fields: FIELDS_TECNO,
          data: {
            numero:           novoNumero,
            tipo:             'Queixa Técnica',
            produto:          rec.produto || '',
            descricao:        rec.descricao || '',
            data:             today(),
            status:           'Aberto',
            reclamacaoOrigem: rec.numero,
          },
          onSave: data => {
            db.add('tecno', data);
            db.update('reclamacoes', numId, { numeroTecnovig: data.numero });
            toast(`Notificação ${data.numero} criada e vinculada à reclamação ${rec.numero}!`);
            refresh(container);
          },
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
