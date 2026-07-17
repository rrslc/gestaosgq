import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { AREAS_MSB } from '../constants.js';

const AREAS_AUDIT = AREAS_MSB;
const TIPOS_AUDIT = ['Interna SGQ', 'Interna Processo', 'Certificação', 'Regulatória ANVISA', 'Auditoria em Fornecedor'];
const CLOSED      = ['Concluída', 'Cancelada'];

const STATUS_AUDIT = ['Planejada', 'Em Execução', 'Concluída', 'Cancelada'];

const STAGE_ORDER = ['Planejada', 'Em Execução', 'Concluída'];

const PIPELINE = [
  { key: 'Planejada',   label: 'Planejada',   color: 'var(--blue)'  },
  { key: 'Em Execução', label: 'Em Execução', color: 'var(--amber)' },
  { key: 'Concluída',   label: 'Concluída',   color: 'var(--green)' },
];

const NEXT_STATUS = {
  'Planejada':   'Em Execução',
  'Em Execução': 'Concluída',
};

function currentStageIdx(status) {
  const i = STAGE_ORDER.indexOf(status);
  return i >= 0 ? i : STAGE_ORDER.length;
}

let _router = null;
async function getRouter() {
  if (!_router) { const m = await import('../app.js'); _router = m.router; }
  return _router;
}

function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const all = db.get('auditorias');
  const seq = all.filter(r => (r.numero || '').endsWith(`/${yy}`)).length + 1;
  return `AUD.${String(seq).padStart(3, '0')}/${yy}`;
}

function buildFields(record = null) {
  const nomes = db.get('equipe').map(m => m.nome);
  const resp  = nomes.length ? nomes : ['—'];
  const status     = record?.status ?? 'Planejada';
  const curIdx     = currentStageIdx(status);
  const isTerminal = CLOSED.includes(status);

  function f(stageKey, fieldDef) {
    const si = STAGE_ORDER.indexOf(stageKey);
    return (isTerminal || si < curIdx) ? { ...fieldDef, readonly: true } : fieldDef;
  }

  function h(label, stageKey) {
    const si = STAGE_ORDER.indexOf(stageKey);
    return { id: `_h_${stageKey}`, type: 'heading', label, locked: isTerminal || si < curIdx, span: 2 };
  }

  const base = [
    f('Planejada', { id: 'numero',       label: '1.1  Nº Auditoria',        type: 'text',     required: false, span: 1, readonly: true }),
    f('Planejada', { id: 'dataPrevisao', label: '1.2  Data Prevista',        type: 'date',     required: true,  span: 1 }),
    f('Planejada', { id: 'area',         label: '1.3  Área Auditada',         type: 'select',   required: true,  span: 1, options: AREAS_AUDIT }),
    f('Planejada', { id: 'auditor',      label: '1.4  Auditor Líder',         type: 'select',   required: true,  span: 1, options: resp }),
    f('Planejada', { id: 'tipo',         label: '1.5  Tipo de Auditoria',     type: 'select',   required: true,  span: 1, options: TIPOS_AUDIT }),
    f('Planejada', { id: 'escopo',       label: '1.6  Escopo / Objetivos',    type: 'textarea', required: false, span: 2 }),
  ];

  if (!record) return base;

  const fields = [h('ETAPA 1 — PLANEJAMENTO', 'Planejada'), ...base];

  if (curIdx >= 1) {
    fields.push(
      h('ETAPA 2 — EXECUÇÃO', 'Em Execução'),
      f('Em Execução', { id: 'dataReal',      label: '2.1  Data de Execução Real',                       type: 'date',     required: false, span: 1 }),
      f('Em Execução', { id: 'participantes', label: '2.2  Participantes da Auditoria',                  type: 'text',     required: false, span: 2 }),
      f('Em Execução', { id: 'achados',       label: '2.3  Achados da Auditoria (descrição livre)',       type: 'textarea', required: false, span: 2 }),
      f('Em Execução', { id: 'tipoAchado',    label: '2.4  Tipo de Achado Geral',                        type: 'select',   required: false, span: 1, options: ['Somente Conformidades', 'Observações', 'Não-Conformidades', 'Sem achados registrados'] }),
      f('Em Execução', { id: 'numNC',         label: 'Qtd. Não-Conformidades',                           type: 'text',     required: false, span: 1 }),
      f('Em Execução', { id: 'numObs',        label: 'Qtd. Observações',                                 type: 'text',     required: false, span: 1 }),
      f('Em Execução', { id: 'geraRNC',       label: '2.5  Gera RNC?',                                   type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Em Execução', { id: 'geraCAPA',      label: '2.6  Gera CAPA?',                                  type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
    );
  }

  if (curIdx >= 2) {
    fields.push(
      h('ETAPA 3 — CONCLUSÃO', 'Concluída'),
      f('Concluída', { id: 'conclusoes',     label: '3.1  Conclusões e Recomendações', type: 'textarea', required: false, span: 2 }),
      f('Concluída', { id: 'resultadoGeral', label: '3.2  Resultado Geral',            type: 'select',   required: false, span: 1, options: ['Aprovado', 'Aprovado com Ressalvas', 'Reprovado'] }),
      f('Concluída', { id: 'dataFechamento', label: '3.3  Data de Encerramento',       type: 'date',     required: false, span: 1 }),
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
  if (!items.length) return emptyState('Nenhuma auditoria encontrada.');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Área</th><th>Tipo</th><th>Auditor</th>
          <th>Data Prevista</th><th>Data Real</th><th>Achado</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const nextSt     = NEXT_STATUS[r.status];
            const isTerminal = CLOSED.includes(r.status);
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.area || '—'}</td>
              <td style="font-size:0.8rem;white-space:nowrap">${r.tipo || '—'}</td>
              <td>${r.auditor || '—'}</td>
              <td>${formatDate(r.dataPrevisao)}</td>
              <td>${formatDate(r.dataReal)}</td>
              <td style="font-size:0.8rem">${r.tipoAchado || '—'}</td>
              <td>${statusPill(r.status)}</td>
              <td>
                <div class="td-actions">
                  ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>` : ''}
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>
                  ${!isTerminal ? `<button class="btn btn-secondary btn-sm" data-action="cancel" data-id="${r.id}" title="Cancelar" style="color:var(--muted)">✕</button>` : ''}
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
  const area   = container.querySelector('[data-filter="area"]')?.value ?? '';
  let items = db.get('auditorias');
  if (search) items = items.filter(r =>
    (r.numero  || '').toLowerCase().includes(search) ||
    (r.area    || '').toLowerCase().includes(search) ||
    (r.auditor || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (area)   items = items.filter(r => r.area === area);
  container.querySelector('#aud-pipeline').innerHTML    = renderPipelineBar(db.get('auditorias'));
  container.querySelector('#aud-table-wrap').innerHTML  = renderTable(items);
}

export default {
  render(container) {
    const all = db.get('auditorias');
    container.innerHTML = `
      <div class="page-header">
        <h2>Auditorias — Execução / Achados</h2>
        <button class="btn btn-primary" data-action="new">+ Nova Auditoria</button>
      </div>
      <div id="aud-pipeline">${renderPipelineBar(all)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, área ou auditor…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS_AUDIT)}
        </select>
        <select class="toolbar-select" data-filter="area">
          <option value="">Todas as áreas</option>
          ${AREAS_AUDIT.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div id="aud-table-wrap">${renderTable(all)}</div>
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
          title: 'Nova Auditoria',
          fields: buildFields(null),
          data: { numero: generateNumero(), status: 'Planejada' },
          onSave: data => {
            db.add('auditorias', { ...data, status: 'Planejada' });
            toast('Auditoria criada com sucesso!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('auditorias', numId);
        if (!record) return;
        openModal({
          title: `Editar Auditoria ${record.numero}  —  ${record.status}`,
          fields: buildFields(record),
          data: record,
          onSave: data => {
            db.update('auditorias', numId, data);
            toast('Auditoria atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        showConfirm(`Avançar esta auditoria para "${next}"?`).then(ok => {
          if (!ok) return;
          const updates = { status: next };
          if (next === 'Concluída') updates.dataFechamento = today();
          db.update('auditorias', numId, updates);
          toast(`Auditoria avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'cancel') {
        showConfirm('Cancelar esta auditoria?').then(ok => {
          if (!ok) return;
          db.update('auditorias', numId, { status: 'Cancelada' });
          toast('Auditoria cancelada.', 'warning');
          refresh(container);
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta auditoria?').then(ok => {
          if (!ok) return;
          db.remove('auditorias', numId);
          toast('Auditoria excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
