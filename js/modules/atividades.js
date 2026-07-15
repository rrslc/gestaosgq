/**
 * @fileoverview Atividades Individuais — planejamento e acompanhamento da equipe GQ.
 * Adm/GQ Apoio vê todas; Executor vê e edita apenas as próprias.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { getSession } from '../session.js';
import { can, A } from '../permissions.js';

const TIPOS = ['Treinamento', 'Monitoramento', 'Auditoria Interna', 'Análise', 'Reunião', 'Elaboração', 'Revisão', 'Outro'];
const STATUS_LIST = ['Planejada', 'Em Andamento', 'Concluída', 'Cancelada'];
const STATUS_DONE = new Set(['Concluída', 'Cancelada']);

function buildFields() {
  const equipe = db.get('equipe').map(m => m.nome);
  return [
    { id: 'titulo',       label: 'Título da Atividade', type: 'text',     required: true,  span: 2 },
    { id: 'responsavel',  label: 'Responsável',          type: 'select',   required: true,  span: 1, options: equipe.length ? equipe : ['—'] },
    { id: 'tipo',         label: 'Tipo',                 type: 'select',   required: true,  span: 1, options: TIPOS },
    { id: 'prazo',        label: 'Prazo',                type: 'date',     required: false, span: 1 },
    { id: 'status',       label: 'Status',               type: 'select',   required: true,  span: 1, options: STATUS_LIST },
    { id: 'descricao',    label: 'Descrição',            type: 'textarea', required: false, span: 2 },
    { id: 'observacoes',  label: 'Observações',          type: 'textarea', required: false, span: 2 },
  ];
}

function canEdit(record, session = getSession()) {
  if (!session || !can(session, 'atividades', A.EDIT)) return false;
  if (session.perfil === 'Executor') return record?.responsavel === session.nome;
  return true;
}

function visibleItems(session) {
  const all = db.get('atividades');
  if (!session || session.perfil === 'Adm' || session.perfil === 'GQ Apoio') return all;
  return all.filter(r => r.responsavel === session.nome);
}

function kpiBar(items) {
  const counts = { Planejada: 0, 'Em Andamento': 0, Concluída: 0, Cancelada: 0 };
  items.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  const colors = { Planejada: 'var(--blue)', 'Em Andamento': 'var(--amber)', Concluída: 'var(--green)', Cancelada: 'var(--muted)' };

  return `
    <div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${STATUS_LIST.map((s, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.4rem;font-weight:700;color:${colors[s]}">${counts[s]}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${s}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTable(items, session) {
  if (!items.length) return emptyState('Nenhuma atividade encontrada.');

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Título</th><th>Responsável</th><th>Tipo</th><th>Prazo</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const vencido = r.prazo && !STATUS_DONE.has(r.status) && new Date(r.prazo + 'T00:00:00') < hoje;
            const edit = canEdit(r, session);
            return `<tr>
              <td><strong>${r.titulo}</strong>${r.descricao ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:2px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</div>` : ''}</td>
              <td style="font-size:0.82rem">${r.responsavel || '—'}</td>
              <td style="font-size:0.78rem;color:var(--muted)">${r.tipo || '—'}</td>
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

function refresh(container) {
  const session = getSession();
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  const resp   = container.querySelector('[data-filter="resp"]')?.value ?? '';
  let items = visibleItems(session);
  if (search) items = items.filter(r =>
    r.titulo?.toLowerCase().includes(search) ||
    (r.responsavel || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (resp)   items = items.filter(r => r.responsavel === resp);

  const allVisible = visibleItems(session);
  container.querySelector('#atv-kpi').innerHTML = kpiBar(allVisible);
  container.querySelector('#atv-table-wrap').innerHTML = renderTable(items, session);
}

export default {
  render(container) {
    const session = getSession();
    const items = visibleItems(session);
    const equipe = db.get('equipe').map(m => m.nome);
    const canCreate = can(session, 'atividades', A.EDIT);

    container.innerHTML = `
      <div class="page-header">
        <h2>Atividades Individuais</h2>
        ${canCreate ? `<button class="btn btn-primary" data-action="new">+ Nova Atividade</button>` : ''}
      </div>
      ${session?.perfil === 'Executor' ? `<div style="margin-bottom:12px;padding:8px 12px;background:#eff6ff;border-radius:6px;font-size:0.78rem;color:#1e40af">Exibindo suas atividades</div>` : ''}
      <div id="atv-kpi">${kpiBar(items)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por título ou responsável…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS_LIST)}
        </select>
        ${session?.perfil !== 'Executor' ? `
          <select class="toolbar-select" data-filter="resp">
            <option value="">Todas as responsáveis</option>
            ${equipe.map(n => `<option value="${n}">${n.split(' ')[0]}</option>`).join('')}
          </select>
        ` : ''}
      </div>
      <div class="card">
        <div id="atv-table-wrap">${renderTable(items, session)}</div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;
      const session = getSession();

      if (action === 'new') {
        if (!can(session, 'atividades', A.EDIT)) return;
        const defaults = session?.perfil === 'Executor' ? { responsavel: session.nome, status: 'Planejada' } : { status: 'Planejada' };
        openModal({
          title: 'Nova Atividade',
          fields: buildFields(),
          data: defaults,
          onSave: data => {
            db.add('atividades', data);
            toast('Atividade criada!');
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
          fields: auth ? buildFields() : buildFields().map(f => f.type !== 'heading' ? { ...f, readonly: true } : f),
          data: record,
          onSave: data => {
            if (!auth) return;
            db.update('atividades', numId, data);
            toast('Atividade atualizada!');
            refresh(container);
          },
        });
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
