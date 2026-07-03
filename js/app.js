/**
 * @fileoverview Entry point do SGQ — registra rotas, eventos globais e inicializa a aplicação.
 */

import { Router } from './router.js';
import { db } from './db.js';
import { toast } from './toast.js';
import { today, formatDate } from './utils.js';
import { ROUTES } from './constants.js';

// Modules
import dashboard    from './modules/dashboard.js';
import agenda       from './modules/agenda.js';
import capa         from './modules/capa.js';
import rnc          from './modules/rnc.js';
import fornecedores from './modules/fornecedores.js';
import tecnovig     from './modules/tecnovig.js';
import validacoes   from './modules/validacoes.js';
import gcm          from './modules/gcm.js';
import risco        from './modules/risco.js';
import monitoramento   from './modules/monitoramento.js';
import obrigacoes   from './modules/obrigacoes.js';
import documentos   from './modules/documentos.js';
import elaboracao   from './modules/elaboracao.js';
import equipe       from './modules/equipe.js';
import cronograma   from './modules/cronograma.js';
import calendario   from './modules/calendario.js';
import configuracoes from './modules/configuracoes.js';
import permissoes   from './modules/permissoes.js';

// ── Router ───────────────────────────────────────────────────────────────────

export const router = new Router({
  [ROUTES.DASHBOARD]:    { module: dashboard,    title: 'Dashboard',                icon: '◉' },
  [ROUTES.AGENDA]:       { module: agenda,       title: 'Agenda GQ',                icon: '📅' },
  [ROUTES.CAPA]:         { module: capa,         title: 'CAPA',                     icon: '◈' },
  [ROUTES.RNC]:          { module: rnc,          title: 'RNC',                      icon: '⚑' },
  [ROUTES.FORNECEDORES]: { module: fornecedores, title: 'Fornecedores',             icon: '⬡' },
  [ROUTES.TECNOVIG]:     { module: tecnovig,     title: 'Tecnovigilância',          icon: '⚕' },
  [ROUTES.VALIDACOES]:   { module: validacoes,   title: 'Validações',               icon: '✔' },
  [ROUTES.GCM]:          { module: gcm,          title: 'Gestão de Mudanças',       icon: '↻' },
  [ROUTES.RISCO]:        { module: risco,        title: 'Análise de Risco',         icon: '⚠' },
  [ROUTES.MONITORAMENTO]: { module: monitoramento, title: 'Monitoramento da Fábrica', icon: '🏭' },
  [ROUTES.OBRIGACOES]:   { module: obrigacoes,   title: 'Obrig. Regulatórias',      icon: '📋' },
  [ROUTES.DOCUMENTOS]:   { module: documentos,   title: 'Controle de Docs.',         icon: '📄' },
  [ROUTES.ELABORACAO]:   { module: elaboracao,   title: 'Elaboração de Docs.',        icon: '✏' },
  [ROUTES.EQUIPE]:       { module: equipe,       title: 'Equipe',                   icon: '⚇' },
  [ROUTES.CRONOGRAMA]:   { module: cronograma,   title: 'Cronograma',               icon: '▤' },
  [ROUTES.CALENDARIO]:   { module: calendario,   title: 'Calendário',               icon: '▦' },
  [ROUTES.CONFIGURACOES]:{ module: configuracoes,title: 'Configurações',            icon: '⚙' },
  [ROUTES.PERMISSOES]:  { module: permissoes,   title: 'Permissões de Acesso',      icon: '🔐' },
});

// ── Sidebar navigation (event delegation) ───────────────────────────────────

document.getElementById('sidebar').addEventListener('click', e => {
  const item = e.target.closest('[data-route]');
  if (!item) return;
  router.navigate(item.dataset.route);
});

// ── Topbar date ──────────────────────────────────────────────────────────────

const dateEl = document.getElementById('topbar-date');
if (dateEl) {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

// ── Import / Export ──────────────────────────────────────────────────────────

document.getElementById('btn-export')?.addEventListener('click', () => {
  try {
    const json = db.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sgq-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exportado com sucesso!');
  } catch (e) {
    toast('Erro ao exportar backup: ' + e.message, 'error');
  }
});

document.getElementById('btn-import')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        db.importJSON(reader.result);
        toast('Dados importados com sucesso! Recarregando…');
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        toast(e.message, 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ── Update sidebar badges ────────────────────────────────────────────────────

function updateAllBadges() {
  const capaOpen = db.get('capa').filter(r => r.status === 'Aberta' || r.status === 'Em Andamento').length;
  const rncOpen  = db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada').length;
  router.updateBadge(ROUTES.CAPA, capaOpen);
  router.updateBadge(ROUTES.RNC, rncOpen);
}

// ── Sync error handler ───────────────────────────────────────────────────────

window.addEventListener('sgq:sync-error', e => {
  toast(`Erro ao sincronizar com o servidor: ${e.detail}`, 'error');
});

window.addEventListener('sgq:import-warning', () => {
  toast('Dados importados localmente. Para sincronizar com o Neon, faça um novo deploy.', 'warning');
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

db.ready.then(() => {
  // Exibe o modo de armazenamento ativo no topbar
  const modeEl = document.getElementById('topbar-mode');
  if (modeEl) {
    const isNeon = db.mode === 'neon';
    modeEl.textContent = isNeon ? '🟢 Neon' : '🟡 Local';
    modeEl.title = isNeon
      ? 'Conectado ao banco Neon PostgreSQL'
      : 'Modo local (localStorage) — sem backend disponível';
  }

  updateAllBadges();

  const initialRoute = window.location.hash.replace('#', '') || ROUTES.DASHBOARD;
  router.navigate(initialRoute);
});

