/**
 * @fileoverview Permissões de Acesso — gestão de perfis, matriz de permissões e trilha de auditoria.
 * Conformidade: CFR 21 Part 11 · ANVISA RDC 665/2022 · IN 134/2022 · Guia 33 · ISO 13485:2016 §4.1.6.
 */

import { db } from '../db.js';
import { statusPill, formatDate } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { PERFIS, MODULOS_PERM, ACOES_PERM } from '../constants.js';

const COR_PERFIL = {
  'GQ Administrador':    '#dc2626',
  'Gestor GQ':           '#2563eb',
  'Garantia da Qualidade': '#c2410c',
  'Elaborador':          '#059669',
  'Revisor':             '#7c3aed',
  'Aprovador':           '#d97706',
  'Executor':            '#0891b2',
  'Resp. por Impressão': '#65a30d',
  'Consulta':            '#6b7280',
};

// ── CFR Part 11 Checklist ───────────────────────────────────────────────────

const CFR_ITEMS = [
  { ref: '§11.10(a)', req: 'Validação do sistema computadorizado', status: 'Pendente',    nota: 'Plano de validação deve ser elaborado conforme VAL-2026-010' },
  { ref: '§11.10(b)', req: 'Capacidade de gerar cópias legíveis e completas', status: 'Atendido', nota: 'Exportação JSON + impressão via browser' },
  { ref: '§11.10(c)', req: 'Proteção e arquivamento de registros', status: 'Parcial',    nota: 'Backup Neon PostgreSQL + export JSON manual' },
  { ref: '§11.10(d)', req: 'Limitação de acesso a usuários autorizados', status: 'Parcial',    nota: 'Matriz de perfis implementada — autenticação em desenvolvimento' },
  { ref: '§11.10(e)', req: 'Trilha de auditoria com data/hora e usuário', status: 'Atendido', nota: 'Módulo Trilha de Auditoria ativo em Documentos e Permissões' },
  { ref: '§11.10(f)', req: 'Verificação sequencial de etapas do fluxo', status: 'Atendido', nota: 'Kanban de documentos impõe sequência Elaboração → Revisão → Aprovação → Homologação' },
  { ref: '§11.10(g)', req: 'Verificação de autoridade por perfil', status: 'Parcial',    nota: 'Perfis definidos — enforcement no login em desenvolvimento' },
  { ref: '§11.10(h)', req: 'Verificação de completude de entrada de dados', status: 'Atendido', nota: 'Campos obrigatórios validados em todos os formulários' },
  { ref: '§11.100',   req: 'Assinatura eletrônica única por indivíduo', status: 'Atendido', nota: 'Modal de assinatura com identificação, data/hora e significado registrados na trilha' },
  { ref: '§11.200',   req: 'Componentes de assinatura: nome + data + significado', status: 'Atendido', nota: 'Implementado no modal de assinatura para Aprovação e Homologação' },
  { ref: 'ANVISA RDC 665/2022', req: 'BPF: sistema computadorizado controlado, acesso restrito, integridade de dados e trilha de auditoria', status: 'Parcial', nota: 'Trilha ativa, perfis definidos — autenticação formal e plano de validação (VAL-2026-010) pendentes' },
  { ref: 'ANVISA IN 134/2022', req: 'Requisitos para certificação e habilitação de sistemas de informação em saúde com dados de registros regulatórios', status: 'Parcial', nota: 'Controles de acesso e rastreabilidade implementados — certificação formal pendente' },
  { ref: 'ANVISA Guia 33', req: 'Validação de sistemas computadorizados: categorização de risco (GAMP), plano de validação, testes e documentação', status: 'Pendente', nota: 'Plano de validação (VAL-2026-010) a ser elaborado seguindo metodologia do Guia 33 / GAMP 5' },
  { ref: 'ISO 13485:2016 §4.1.6', req: 'Validação do software utilizado no SGQ antes do uso e após alterações', status: 'Pendente', nota: 'Execução do plano de validação vinculada ao Guia 33 e VAL-2026-010' },
  { ref: 'ISO 13485:2016 §4.2.5', req: 'Controle de documentos com status e revisão rastreáveis', status: 'Atendido', nota: 'Status, revisão, elaboradores, revisores, aprovadores, homologador registrados' },
];

const COR_STATUS = { 'Atendido': '#059669', 'Parcial': '#d97706', 'Pendente': '#dc2626' };

// ── Tabs ─────────────────────────────────────────────────────────────────────

function renderPerfis() {
  const perfis = db.get('perfis');
  if (!perfis.length) return '<p style="color:var(--muted);padding:20px">Nenhum perfil configurado.</p>';

  return `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      ${perfis.map(p => {
        const cor = COR_PERFIL[p.nome] || p.cor || '#6b7280';
        const nomeUsuarios = db.get('equipe').filter(m => m.perfil === p.nome);
        const perms = p.permissoes || {};
        const totalOn = Object.values(perms).reduce((acc, m) => acc + Object.values(m).filter(Boolean).length, 0);
        const totalMax = MODULOS_PERM.length * ACOES_PERM.length;
        return `
          <div class="card" style="padding:16px;border-top:4px solid ${cor}">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
              <div style="width:36px;height:36px;border-radius:8px;background:${cor}20;display:flex;align-items:center;justify-content:center;font-size:1.2rem;color:${cor}">🔐</div>
              <div>
                <div style="font-weight:700;color:${cor}">${p.nome}</div>
                <div style="font-size:0.75rem;color:var(--muted)">${p.descricao}</div>
              </div>
            </div>
            <div style="background:var(--bg);border-radius:6px;padding:8px 10px;font-size:0.78rem;margin-bottom:8px">
              <strong>${totalOn}/${totalMax}</strong> permissões ativas
              <div style="height:4px;background:var(--border);border-radius:2px;margin-top:4px">
                <div style="height:4px;background:${cor};border-radius:2px;width:${Math.round(100*totalOn/totalMax)}%"></div>
              </div>
            </div>
            <div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px">
              ${nomeUsuarios.length > 0
                ? `Usuários: ${nomeUsuarios.map(m => `<strong>${m.nome.split(' ')[0]}</strong>`).join(', ')}`
                : 'Nenhum usuário atribuído'}
            </div>
            <button class="btn btn-secondary btn-sm" data-action="ver-matriz" data-perfil-id="${p.id}">Ver matriz completa</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMatrizPerfil(perfilId) {
  const perfil = db.get('perfis').find(p => p.id === Number(perfilId));
  if (!perfil) return '<p>Perfil não encontrado.</p>';
  const cor = COR_PERFIL[perfil.nome] || perfil.cor || '#6b7280';
  const perms = perfil.permissoes || {};

  return `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px">
      <button class="btn btn-secondary btn-sm" data-action="voltar-perfis">← Voltar</button>
      <h3 style="font-size:1rem;color:${cor}">${perfil.nome} — Matriz de Permissões</h3>
    </div>
    <div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px">${perfil.descricao}</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Módulo</th>
            ${ACOES_PERM.map(a => `<th style="text-align:center">${a.label}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${MODULOS_PERM.map(mod => {
            const mp = perms[mod.key] || {};
            return `
              <tr>
                <td style="font-weight:600">${mod.label}</td>
                ${ACOES_PERM.map(a => `
                  <td style="text-align:center">
                    ${mp[a.key]
                      ? `<span style="color:#059669;font-size:1.1rem">✓</span>`
                      : `<span style="color:var(--border);font-size:1rem">–</span>`}
                  </td>
                `).join('')}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsuarios() {
  const equipe = db.get('equipe');
  const perfis = db.get('perfis');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Nome</th><th>Cargo</th><th>Área</th><th>Perfil de Acesso</th><th>E-mail</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${equipe.map(m => {
            const cor = COR_PERFIL[m.perfil] || '#6b7280';
            return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:28px;height:28px;border-radius:50%;background:${m.cor || '#6b7280'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700">${m.iniciais}</div>
                    <strong>${m.nome}</strong>
                  </div>
                </td>
                <td style="font-size:0.82rem">${m.cargo}</td>
                <td style="font-size:0.82rem">${m.area || '—'}</td>
                <td>
                  <span style="display:inline-block;padding:2px 10px;border-radius:4px;background:${cor}15;color:${cor};font-size:0.75rem;font-weight:700">${m.perfil || 'Sem perfil'}</span>
                </td>
                <td style="font-size:0.78rem;color:var(--muted)">${m.email || '—'}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" data-action="edit-perfil" data-id="${m.id}">Alterar perfil</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:12px;padding:10px 14px;background:#eff6ff;border-radius:6px;font-size:0.78rem;color:#1e40af">
      <strong>Nota:</strong> A alteração de perfil é registrada na trilha de auditoria conforme CFR 21 Part 11 §11.10(e).
    </div>
  `;
}

function renderTrilha() {
  const trilha = [...db.get('trilha')].reverse().slice(0, 200);
  const modFiltro = document.querySelector('#trilha-mod-filter')?.value || '';
  const usuFiltro = document.querySelector('#trilha-usu-filter')?.value?.toLowerCase() || '';
  const filtered = trilha.filter(e => {
    if (modFiltro && e.modulo !== modFiltro) return false;
    if (usuFiltro && !e.usuario.toLowerCase().includes(usuFiltro)) return false;
    return true;
  });

  if (!filtered.length) return `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">
    Nenhum evento registrado. Ações no sistema (criação, edição, aprovação) serão registradas aqui conforme CFR 21 Part 11 §11.10(e).
  </div>`;

  const ACAO_COR = { 'Criou': '#059669', 'Editou': '#2563eb', 'Excluiu': '#dc2626', 'Solicitação': '#7c3aed', 'Avançou para Em Revisão': '#7c3aed', 'Avançou para Em Aprovação': '#d97706', 'Avançou para Em Homologação': '#059669', 'Homologação': '#059669' };

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Usuário</th>
            <th>Ação</th>
            <th>Módulo</th>
            <th>Registro</th>
            <th>Detalhe</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(e => {
            const cor = ACAO_COR[e.acao] || '#6b7280';
            return `
              <tr>
                <td style="font-size:0.75rem;white-space:nowrap">${new Date(e.dataHora).toLocaleString('pt-BR')}</td>
                <td style="font-size:0.78rem;font-weight:500">${e.usuario}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${cor}15;color:${cor};font-size:0.75rem;font-weight:600">${e.acao}</span></td>
                <td style="font-size:0.78rem;color:var(--muted);text-transform:capitalize">${e.modulo}</td>
                <td style="font-family:monospace;font-size:0.78rem">${e.registro}</td>
                <td style="font-size:0.75rem;color:var(--muted);max-width:260px">${e.detalhe}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:8px;font-size:0.75rem;color:var(--muted)">
      Exibindo ${filtered.length} de ${trilha.length} eventos · Trilha protegida — registros não podem ser alterados ou excluídos
    </div>
  `;
}

function renderCFR() {
  const grupos = [
    { titulo: 'Atendido', cor: '#059669', items: CFR_ITEMS.filter(i => i.status === 'Atendido') },
    { titulo: 'Parcialmente Atendido', cor: '#d97706', items: CFR_ITEMS.filter(i => i.status === 'Parcial') },
    { titulo: 'Pendente', cor: '#dc2626', items: CFR_ITEMS.filter(i => i.status === 'Pendente') },
  ];

  const total = CFR_ITEMS.length;
  const atendidos = CFR_ITEMS.filter(i => i.status === 'Atendido').length;
  const parciais  = CFR_ITEMS.filter(i => i.status === 'Parcial').length;

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      ${grupos.map(g => `
        <div style="background:${g.cor}10;border:1px solid ${g.cor}30;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:${g.cor}">${g.items.length}</div>
          <div style="font-size:0.75rem;color:${g.cor};font-weight:600">${g.titulo}</div>
        </div>
      `).join('')}
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.82rem;color:#1e3a5f">
      <strong>Conformidade Atual:</strong> ${atendidos}/${total} requisitos totalmente atendidos (${Math.round(100*atendidos/total)}%).
      ${parciais > 0 ? `${parciais} em implementação — autenticação completa e validação formal do sistema (VAL-2026-010) pendentes.` : ''}
      <br><strong>Referências:</strong> CFR 21 Part 11 · ANVISA RDC 665/2022 · IN 134/2022 · Guia 33 · ISO 13485:2016 §4.1.6 e §4.2.5 · POP-GQ-002/003
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Referência</th><th>Requisito</th><th>Status</th><th>Observação de implementação</th></tr>
        </thead>
        <tbody>
          ${CFR_ITEMS.map(item => {
            const cor = COR_STATUS[item.status] || '#6b7280';
            return `
              <tr>
                <td style="font-family:monospace;font-size:0.75rem;font-weight:700;color:${cor};white-space:nowrap">${item.ref}</td>
                <td style="font-size:0.82rem">${item.req}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${cor}15;color:${cor};font-size:0.75rem;font-weight:600">${item.status}</span></td>
                <td style="font-size:0.78rem;color:var(--muted)">${item.nota}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

let _tab = 'perfis';
let _viewMatriz = null;

function switchTab(container, tab) {
  _tab = tab;
  _viewMatriz = null;
  container.querySelectorAll('[data-tab-btn]').forEach(b => {
    const active = b.dataset.tabBtn === tab;
    b.style.fontWeight = active ? '700' : '400';
    b.style.borderBottom = active ? '2px solid var(--blue-light)' : '2px solid transparent';
    b.style.color = active ? 'var(--blue-light)' : 'var(--muted)';
  });
  rebuildContent(container);
}

function rebuildContent(container) {
  const wrap = container.querySelector('#perm-content');
  if (!wrap) return;
  if (_tab === 'perfis' && _viewMatriz) {
    wrap.innerHTML = renderMatrizPerfil(_viewMatriz);
  } else if (_tab === 'perfis') {
    wrap.innerHTML = renderPerfis();
  } else if (_tab === 'usuarios') {
    wrap.innerHTML = renderUsuarios();
  } else if (_tab === 'trilha') {
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <select id="trilha-mod-filter" class="toolbar-select" style="min-width:160px">
          <option value="">Todos os módulos</option>
          <option value="documentos">Documentos</option>
          <option value="capa">CAPA</option>
          <option value="rnc">RNC</option>
          <option value="fornecedores">Fornecedores</option>
          <option value="validacoes">Validações</option>
          <option value="permissoes">Permissões</option>
        </select>
        <input type="text" id="trilha-usu-filter" class="toolbar-search" placeholder="Filtrar por usuário…" style="max-width:200px">
        <button class="btn btn-secondary btn-sm" data-action="export-trilha">⬇ Exportar CSV</button>
      </div>
      ${renderTrilha()}
    `;
    container.querySelector('#trilha-mod-filter')?.addEventListener('change', () => rebuildContent(container));
    container.querySelector('#trilha-usu-filter')?.addEventListener('input', () => rebuildContent(container));
  } else if (_tab === 'cfr11') {
    wrap.innerHTML = renderCFR();
  }
}

export default {
  render(container) {
    const trilhaTotal = db.get('trilha').length;
    container.innerHTML = `
      <div class="page-header">
        <h2>Permissões de Acesso e Conformidade</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;padding:3px 10px;font-size:0.75rem">${trilhaTotal} eventos na trilha</span>
        </div>
      </div>
      <div style="font-size:0.78rem;color:var(--muted);margin:-6px 0 12px">
        CFR 21 Part 11 · ANVISA RDC 665/2022 · IN 134/2022 · Guia 33 · ISO 13485:2016 §4.1.6
      </div>

      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px">
        <button data-tab-btn="perfis"   style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid var(--blue-light);color:var(--blue-light);font-weight:700">Perfis</button>
        <button data-tab-btn="usuarios" style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">Usuários</button>
        <button data-tab-btn="trilha"   style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">Trilha de Auditoria</button>
        <button data-tab-btn="cfr11"    style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">CFR 11 / ANVISA</button>
      </div>

      <div class="card" style="padding:14px">
        <div id="perm-content">
          ${renderPerfis()}
        </div>
      </div>
    `;
  },

  init(container) {
    _tab = 'perfis'; _viewMatriz = null;

    container.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-tab-btn]');
      if (tabBtn) { switchTab(container, tabBtn.dataset.tabBtn); return; }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, perfilId } = btn.dataset;

      if (action === 'ver-matriz') {
        _viewMatriz = perfilId;
        rebuildContent(container);
      }

      if (action === 'voltar-perfis') {
        _viewMatriz = null;
        rebuildContent(container);
      }

      if (action === 'edit-perfil') {
        const membro = db.getById('equipe', Number(id));
        if (!membro) return;
        openModal({
          title: `Perfil de Acesso — ${membro.nome}`,
          fields: [
            { id: 'perfil', label: 'Perfil de acesso', type: 'select', required: true, span: 2, options: PERFIS },
            { id: 'email',  label: 'E-mail',            type: 'text',   required: false, span: 2 },
            { id: 'area',   label: 'Área',              type: 'text',   required: false, span: 2 },
          ],
          data: membro,
          onSave: data => {
            db.update('equipe', Number(id), { perfil: data.perfil, email: data.email, area: data.area });
            db.addAudit('Editou', 'permissoes', membro.nome, `Perfil alterado para "${data.perfil}"`);
            toast(`Perfil de ${membro.nome} alterado para "${data.perfil}"`);
            rebuildContent(container);
          },
        });
      }

      if (action === 'export-trilha') {
        const trilha = [...db.get('trilha')].reverse();
        const csv = ['Data/Hora,Usuario,Acao,Modulo,Registro,Detalhe',
          ...trilha.map(e => [
            new Date(e.dataHora).toLocaleString('pt-BR'),
            e.usuario, e.acao, e.modulo, e.registro,
            `"${(e.detalhe || '').replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `trilha-auditoria-${new Date().toISOString().substring(0,10)}.csv`;
        a.click();
        toast('Trilha exportada em CSV');
      }
    });
  },
};
