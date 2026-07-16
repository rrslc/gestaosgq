/**
 * @fileoverview Trilha de Auditoria — visualizador do log CFR 21 Part 11 / RDC 665/2022.
 * Acesso restrito: GQ Administrador (gestão) e GQ Analista (leitura).
 */

import { db } from '../db.js';

function formatDt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const ACAO_COR = {
  'Login':    'pill-green',
  'Logout':   'pill-gray',
  'Criar':    'pill-blue',
  'Editar':   'pill-amber',
  'Excluir':  'pill-red',
  'Bloqueio': 'pill-red',
};

function pill(texto) {
  const cls = ACAO_COR[texto] || 'pill-gray';
  return `<span class="status-pill ${cls}">${texto}</span>`;
}

function csvEsc(v) {
  if (v == null) return '';
  const s = String(v).replace(/"/g, '""');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s}"` : s;
}

function buildTable(rows) {
  if (!rows.length) {
    return `<div class="empty-state"><span class="empty-icon">📋</span><p>Nenhum registro encontrado.</p></div>`;
  }
  return `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead><tr>
          <th>Data / Hora</th>
          <th>Usuário</th>
          <th>Ação</th>
          <th>Módulo</th>
          <th>Reg. ID</th>
          <th style="max-width:320px">Detalhe</th>
        </tr></thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td style="white-space:nowrap;font-variant-numeric:tabular-nums">${formatDt(r.dataHora)}</td>
              <td style="white-space:nowrap">${r.usuario || '—'}</td>
              <td>${pill(r.acao)}</td>
              <td><code style="font-size:0.78rem">${r.modulo || '—'}</code></td>
              <td style="text-align:center">${r.registro || '—'}</td>
              <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem;color:var(--muted)" title="${(r.detalhe||'').replace(/"/g,'&quot;')}">${r.detalhe || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function getFiltered(filtros) {
  let rows = db.get('trilha').slice().reverse(); // mais recentes primeiro

  if (filtros.de) {
    const de = new Date(filtros.de + 'T00:00:00');
    rows = rows.filter(r => r.dataHora && new Date(r.dataHora) >= de);
  }
  if (filtros.ate) {
    const ate = new Date(filtros.ate + 'T23:59:59');
    rows = rows.filter(r => r.dataHora && new Date(r.dataHora) <= ate);
  }
  if (filtros.usuario) {
    const u = filtros.usuario.toLowerCase();
    rows = rows.filter(r => r.usuario && r.usuario.toLowerCase().includes(u));
  }
  if (filtros.acao) {
    rows = rows.filter(r => r.acao === filtros.acao);
  }
  if (filtros.modulo) {
    rows = rows.filter(r => r.modulo === filtros.modulo);
  }

  return rows;
}

function renderFilters(rows) {
  const modulos = [...new Set(db.get('trilha').map(r => r.modulo).filter(Boolean))].sort();
  const acoes   = [...new Set(db.get('trilha').map(r => r.acao).filter(Boolean))].sort();
  return `
    <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:16px">
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="font-size:0.72rem;color:var(--muted)">De</label>
        <input type="date" id="f-de" class="form-input" style="width:140px">
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="font-size:0.72rem;color:var(--muted)">Até</label>
        <input type="date" id="f-ate" class="form-input" style="width:140px">
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="font-size:0.72rem;color:var(--muted)">Usuário</label>
        <input type="text" id="f-usuario" class="form-input" placeholder="Buscar..." style="width:160px">
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="font-size:0.72rem;color:var(--muted)">Ação</label>
        <select id="f-acao" class="form-input" style="width:130px">
          <option value="">Todas</option>
          ${acoes.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;flex-direction:column;gap:3px">
        <label style="font-size:0.72rem;color:var(--muted)">Módulo</label>
        <select id="f-modulo" class="form-input" style="width:150px">
          <option value="">Todos</option>
          ${modulos.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-limpar">Limpar</button>
      <button class="btn btn-primary btn-sm" id="btn-csv">⬇ Exportar CSV</button>
      <span style="margin-left:auto;font-size:0.78rem;color:var(--muted);align-self:center">${rows.length} registro(s)</span>
    </div>`;
}

function getFiltersFromDOM(container) {
  return {
    de:      container.querySelector('#f-de')?.value || '',
    ate:     container.querySelector('#f-ate')?.value || '',
    usuario: container.querySelector('#f-usuario')?.value || '',
    acao:    container.querySelector('#f-acao')?.value || '',
    modulo:  container.querySelector('#f-modulo')?.value || '',
  };
}

function exportCSV(rows) {
  const header = ['Data/Hora', 'Usuário', 'Ação', 'Módulo', 'Reg.ID', 'Detalhe'];
  const lines = [
    header.map(csvEsc).join(','),
    ...rows.map(r => [r.dataHora, r.usuario, r.acao, r.modulo, r.registro, r.detalhe].map(csvEsc).join(',')),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const today = new Date().toISOString().slice(0, 10);
  a.download = `sgq-trilha-auditoria-${today}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function refresh(container) {
  const filtros = getFiltersFromDOM(container);
  const rows = getFiltered(filtros);
  container.querySelector('#trilha-count').textContent = `${rows.length} registro(s)`;
  container.querySelector('#trilha-table').innerHTML = buildTable(rows);
  container._auditRows = rows;
}

export default {
  render(container) {
    const rows = db.get('trilha').slice().reverse();
    container.innerHTML = `
      <div class="page-header">
        <h2>Trilha de Auditoria</h2>
        <span style="font-size:0.75rem;color:var(--muted);align-self:center">21 CFR Part 11 · RDC 665/2022 · ISO 13485 §4.1.6</span>
      </div>
      <div class="card" style="margin-bottom:16px">
        <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end">
          <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:0.72rem;color:var(--muted)">De</label>
            <input type="date" id="f-de" class="form-input" style="width:140px">
          </div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:0.72rem;color:var(--muted)">Até</label>
            <input type="date" id="f-ate" class="form-input" style="width:140px">
          </div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:0.72rem;color:var(--muted)">Usuário</label>
            <input type="text" id="f-usuario" class="form-input" placeholder="Buscar..." style="width:160px">
          </div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:0.72rem;color:var(--muted)">Ação</label>
            <select id="f-acao" class="form-input" style="width:130px">
              <option value="">Todas</option>
              <option value="Login">Login</option>
              <option value="Logout">Logout</option>
              <option value="Criar">Criar</option>
              <option value="Editar">Editar</option>
              <option value="Excluir">Excluir</option>
              <option value="Bloqueio">Bloqueio</option>
            </select>
          </div>
          <div style="display:flex;flex-direction:column;gap:3px">
            <label style="font-size:0.72rem;color:var(--muted)">Módulo</label>
            <select id="f-modulo" class="form-input" style="width:150px">
              <option value="">Todos</option>
              ${[...new Set(db.get('trilha').map(r => r.modulo).filter(Boolean))].sort().map(m => `<option value="${m}">${m}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-secondary btn-sm" id="btn-limpar">Limpar</button>
          <button class="btn btn-primary btn-sm" id="btn-csv">⬇ Exportar CSV</button>
          <span id="trilha-count" style="margin-left:auto;font-size:0.78rem;color:var(--muted);align-self:center">${rows.length} registro(s)</span>
        </div>
      </div>
      <div id="trilha-table">${buildTable(rows)}</div>
    `;
    container._auditRows = rows;
  },

  init(container) {
    const inputs = ['f-de', 'f-ate', 'f-usuario', 'f-acao', 'f-modulo'];
    inputs.forEach(id => {
      container.querySelector('#' + id)?.addEventListener('input', () => refresh(container));
      container.querySelector('#' + id)?.addEventListener('change', () => refresh(container));
    });

    container.querySelector('#btn-limpar')?.addEventListener('click', () => {
      inputs.forEach(id => {
        const el = container.querySelector('#' + id);
        if (el) el.value = '';
      });
      refresh(container);
    });

    container.querySelector('#btn-csv')?.addEventListener('click', () => {
      exportCSV(container._auditRows || []);
    });
  },
};
