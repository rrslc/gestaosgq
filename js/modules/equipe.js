/**
 * @fileoverview Módulo Equipe — cards de colaboradoras com workload.
 */

import { db } from '../db.js';
import { progressBar, emptyState, statusPill } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';

const CARGOS = [
  'Gerente da Qualidade',
  'Analista de Qualidade',
  'Engenheira de Processos',
  'Especialista Regulatório',
  'Técnica de Qualidade',
  'Coordenadora da Qualidade',
  'Auditora Interna',
];

const CORES = ['#2d5be3', '#00897b', '#7c3aed', '#f59e0b', '#dc2626', '#00b4d8', '#0d1b4b'];

const PERFIS_ACESSO = [
  'GQ Administrador', 'Gestor GQ', 'Elaborador', 'Revisor', 'Aprovador', 'Executor', 'Resp. por Impressão', 'Consulta',
];

const FIELDS = [
  { id: 'nome',     label: 'Nome Completo',       type: 'text',   required: true,  span: 2 },
  { id: 'iniciais', label: 'Iniciais (ex: RC)',    type: 'text',   required: true,  span: 1 },
  { id: 'cargo',    label: 'Cargo',                type: 'select', required: true,  span: 1, options: CARGOS },
  { id: 'area',     label: 'Área / Setor',         type: 'text',   required: false, span: 1 },
  { id: 'email',    label: 'E-mail corporativo',   type: 'text',   required: false, span: 1 },
  { id: 'perfil',   label: 'Perfis de acesso',     type: 'checkboxgroup', required: false, span: 2, options: PERFIS_ACESSO },
  { id: 'cor',      label: 'Cor do Avatar (hex)',   type: 'text',   required: false, span: 2 },
  { id: 'senha',    label: 'Senha de Acesso',       type: 'text',   required: false, span: 2 },
];

function getOpenItems(nome) {
  const items = [];
  db.get('capa').filter(r => (r.responsavelAbertura === nome || r.responsavel === nome) && !['Encerrada', 'Não Procedente', 'Concluída', 'Cancelada'].includes(r.status))
    .forEach(r => items.push({ label: r.numero + ' — ' + r.descricao, tipo: 'CAPA' }));
  db.get('rnc').filter(r => r.responsavel === nome && r.status !== 'Encerrada' && r.status !== 'Cancelada')
    .forEach(r => items.push({ label: r.numero + ' — ' + r.descricao, tipo: 'RNC' }));
  db.get('validacoes').filter(r => r.responsavel === nome && r.status !== 'Aprovada' && r.status !== 'Reprovada' && r.status !== 'Cancelada')
    .forEach(r => items.push({ label: r.numero + ' — ' + r.descricao, tipo: 'VAL' }));
  db.get('tecno').filter(r => r.responsavel === nome && r.status !== 'Concluído' && r.status !== 'Cancelado')
    .forEach(r => items.push({ label: r.numero + ' — ' + r.descricao, tipo: 'TECNO' }));
  return items;
}

function renderCards() {
  const equipe = db.get('equipe');
  if (!equipe.length) return emptyState('Nenhuma colaboradora cadastrada.');

  const allItems = equipe.map(m => ({ ...m, items: getOpenItems(m.nome) }));
  const maxItems = Math.max(...allItems.map(m => m.items.length), 1);

  return `<div class="team-grid">
    ${allItems.map(m => {
      const pct = Math.round(100 * m.items.length / maxItems);
      const preview = m.items.slice(0, 5);
      return `
        <div class="team-card">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">
            <div class="team-avatar" style="background:${m.cor || '#2d5be3'}">${m.iniciais}</div>
            <div>
              <div class="team-name">${m.nome}</div>
              <div class="team-cargo">${m.cargo}</div>
              <div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:3px">
                ${(Array.isArray(m.perfil) ? m.perfil : (m.perfil ? [m.perfil] : []))
                  .map(p => `<span style="padding:1px 6px;border-radius:3px;background:#eff6ff;color:#1e40af;font-size:0.68rem;font-weight:600">${p}</span>`)
                  .join('')}
              </div>
            </div>
          </div>
          <div style="margin-bottom:8px">
            ${progressBar(pct, pct > 75 ? 'red' : pct > 50 ? 'amber' : 'blue')}
            <div style="font-size:0.72rem;color:var(--muted);margin-top:3px">${m.items.length} atividade(s) em aberto</div>
          </div>
          ${preview.length > 0 ? `
            <div class="team-activities">
              ${preview.map(a => `
                <div class="team-activity-item">
                  ${statusPill(a.tipo)}
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1" title="${a.label}">${a.label}</span>
                </div>
              `).join('')}
              ${m.items.length > 5 ? `<div style="font-size:0.72rem;color:var(--muted);padding-top:3px">+ ${m.items.length - 5} mais…</div>` : ''}
            </div>
          ` : ''}
          <div style="display:flex;gap:6px;margin-top:10px">
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${m.id}">✏ Editar</button>
            <button class="btn btn-danger btn-sm" data-action="delete" data-id="${m.id}">🗑</button>
          </div>
        </div>
      `;
    }).join('')}
  </div>`;
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Equipe da Qualidade</h2>
        <button class="btn btn-primary" data-action="new">+ Nova Colaboradora</button>
      </div>
      <div id="team-cards">
        ${renderCards()}
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new') {
        openModal({ title: 'Nova Colaboradora', fields: FIELDS, data: { cor: CORES[db.get('equipe').length % CORES.length] }, onSave: data => {
          db.add('equipe', data);
          toast('Colaboradora adicionada!');
          container.querySelector('#team-cards').innerHTML = renderCards();
        }});
      }

      if (action === 'edit') {
        const record = db.getById('equipe', numId);
        if (!record) return;
        openModal({ title: 'Editar Colaboradora', fields: FIELDS, data: record, onSave: data => {
          db.update('equipe', numId, data);
          toast('Colaboradora atualizada!');
          container.querySelector('#team-cards').innerHTML = renderCards();
        }});
      }

      if (action === 'delete') {
        showConfirm('Deseja remover esta colaboradora?').then(ok => {
          if (!ok) return;
          db.remove('equipe', numId);
          toast('Colaboradora removida.', 'warning');
          container.querySelector('#team-cards').innerHTML = renderCards();
        });
      }
    });
  },
};

