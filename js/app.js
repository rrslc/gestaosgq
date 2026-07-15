/**
 * @fileoverview Entry point do SGQ — registra rotas, eventos globais e inicializa a aplicação.
 */

import { Router } from './router.js';
import { db } from './db.js';
import { toast } from './toast.js';
import { today, formatDate } from './utils.js';
import { ROUTES } from './constants.js';

// Modules
import dashboard      from './modules/dashboard.js';
import agenda         from './modules/agenda.js';
import capaGerencial  from './modules/capaGerencial.js';
import capaAbertura   from './modules/capaAbertura.js';
import fornecedores from './modules/fornecedores.js';
import tecnovig     from './modules/tecnovig.js';
import validacoes   from './modules/validacoes.js';
import gcm          from './modules/gcm.js';
import gcmGerencial from './modules/gcmGerencial.js';
import gcmAbertura  from './modules/gcmAbertura.js';
import rncGerencial from './modules/rncGerencial.js';
import rncAbertura  from './modules/rncAbertura.js';
import risco        from './modules/risco.js';
import monitoramento, { setTargetArea } from './modules/monitoramento.js';

function monitorArea(key) {
  return {
    render: (c) => { setTargetArea(key); monitoramento.render(c); },
    init:   (c) => monitoramento.init(c),
  };
}
import docsAdmin    from './modules/docsAdmin.js';
import obrigacoes   from './modules/obrigacoes.js';
import documentos   from './modules/documentos.js';
import elaboracao   from './modules/elaboracao.js';
import equipe       from './modules/equipe.js';
import cronograma   from './modules/cronograma.js';
import calendario   from './modules/calendario.js';
import configuracoes        from './modules/configuracoes.js';
import permissoes           from './modules/permissoes.js';
import reclamacoesGerencial from './modules/reclamacoesGerencial.js';
import reclamacoesAbertura  from './modules/reclamacoesAbertura.js';
import auditoriasPlano      from './modules/auditoriasPlano.js';
import auditoriasExec       from './modules/auditoriasExec.js';
import assistenciaTecnica   from './modules/assistenciaTecnica.js';
import revisaoGerencial     from './modules/revisaoGerencial.js';
import projetosGerencial    from './modules/projetosGerencial.js';
import projetosAbertura     from './modules/projetosAbertura.js';

// ── Router ───────────────────────────────────────────────────────────────────

export const router = new Router({
  [ROUTES.DASHBOARD]:      { module: dashboard,     title: 'Dashboard',            icon: '◉' },
  [ROUTES.AGENDA]:         { module: agenda,       title: 'Agenda GQ',             icon: '📅' },
  [ROUTES.CAPA_GERENCIAL]: { module: capaGerencial, title: 'CAPA — Gerencial',     icon: '📊' },
  [ROUTES.CAPA_ABERTURA]:  { module: capaAbertura,  title: 'CAPA — Abertura',      icon: '📋' },
  capa: { module: { render() {}, init() { router.navigate(ROUTES.CAPA_GERENCIAL); } }, title: 'CAPA', icon: '◈' },
  [ROUTES.RNC]:            { module: { render() {}, init() { router.navigate(ROUTES.RNC_GERENCIAL); } }, title: 'RNC', icon: '⚑' },
  [ROUTES.RNC_GERENCIAL]:  { module: rncGerencial,  title: 'RNC — Gerencial',        icon: '📊' },
  [ROUTES.RNC_ABERTURA]:   { module: rncAbertura,   title: 'RNC — Abertura',         icon: '⚑' },
  [ROUTES.FORNECEDORES]: { module: fornecedores, title: 'Fornecedores',             icon: '⬡' },
  [ROUTES.TECNOVIG]:     { module: tecnovig,     title: 'Tecnovigilância',          icon: '⚕' },
  [ROUTES.VALIDACOES]:   { module: validacoes,   title: 'Validações',               icon: '✔' },
  [ROUTES.GCM]:          { module: { render() {}, init() { router.navigate(ROUTES.GCM_GERENCIAL); } }, title: 'GCM', icon: '↻' },
  [ROUTES.GCM_GERENCIAL]:{ module: gcmGerencial,  title: 'GCM — Gerencial',          icon: '📊' },
  [ROUTES.GCM_ABERTURA]: { module: gcmAbertura,   title: 'GCM — Abertura',           icon: '↻' },
  [ROUTES.RISCO]:        { module: risco,        title: 'Análise de Risco',         icon: '⚠' },
  pragas:           { module: monitorArea('pragas'),           title: 'Controle de Pragas',      icon: '🐛' },
  reservatorio:     { module: monitorArea('reservatorio'),     title: 'Limpeza de Reservatório', icon: '💧' },
  residuos:         { module: monitorArea('residuos'),         title: 'Gerenc. de Resíduos',     icon: '♻' },
  microbiologico:   { module: monitorArea('microbiologico'),   title: 'Monit. Microbiológico',   icon: '🔬' },
  limpezaMensal:    { module: monitorArea('limpezaMensal'),    title: 'Limpeza Mensal',          icon: '🧹' },
  gembaWalk:        { module: monitorArea('gembaWalk'),        title: 'Gemba Walk',              icon: '👣' },
  orcamentosAnuais: { module: monitorArea('orcamentosAnuais'), title: 'Orçamentos Anuais',       icon: '📋' },
  docsAdmin:             { module: docsAdmin,    title: 'Docs. Administrativos',    icon: '🗂' },
  [ROUTES.OBRIGACOES]:   { module: obrigacoes,   title: 'Obrig. Regulatórias',      icon: '📋' },
  [ROUTES.DOCUMENTOS]:   { module: documentos,   title: 'Controle de Docs.',         icon: '📄' },
  [ROUTES.ELABORACAO]:   { module: elaboracao,   title: 'Elaboração de Docs.',        icon: '✏' },
  [ROUTES.EQUIPE]:       { module: equipe,       title: 'Equipe',                   icon: '⚇' },
  [ROUTES.CRONOGRAMA]:   { module: cronograma,   title: 'Cronograma',               icon: '▤' },
  [ROUTES.CALENDARIO]:   { module: calendario,   title: 'Calendário',               icon: '▦' },
  [ROUTES.CONFIGURACOES]:      { module: configuracoes,        title: 'Configurações',             icon: '⚙' },
  [ROUTES.PERMISSOES]:         { module: permissoes,           title: 'Permissões de Acesso',       icon: '🔐' },
  [ROUTES.RECLAM_GERENCIAL]:   { module: reclamacoesGerencial, title: 'Reclamações — Gerencial',    icon: '📊' },
  [ROUTES.RECLAM_ABERTURA]:    { module: reclamacoesAbertura,  title: 'Reclamações — Abertura',     icon: '📩' },
  reclamacoes: { module: { render() {}, init() { router.navigate(ROUTES.RECLAM_GERENCIAL); } }, title: 'Reclamações', icon: '📩' },
  [ROUTES.AUDIT_PLANO]:        { module: auditoriasPlano,      title: 'Auditorias — Plano Anual',   icon: '📋' },
  [ROUTES.AUDIT_EXEC]:         { module: auditoriasExec,       title: 'Auditorias — Execução',      icon: '📊' },
  auditorias: { module: { render() {}, init() { router.navigate(ROUTES.AUDIT_PLANO); } }, title: 'Auditorias', icon: '📋' },
  [ROUTES.ASSIST_TEC]:         { module: assistenciaTecnica,   title: 'Assistência Técnica',        icon: '🔧' },
  [ROUTES.REVISAO_GER]:        { module: revisaoGerencial,     title: 'Revisão Gerencial',          icon: '🏛' },
  [ROUTES.PROJ_GERENCIAL]:     { module: projetosGerencial,    title: 'Projetos — Gerencial',       icon: '🗂' },
  [ROUTES.PROJ_ABERTURA]:      { module: projetosAbertura,     title: 'Projetos — Atividades GQ',   icon: '📐' },
  projetos: { module: { render() {}, init() { router.navigate(ROUTES.PROJ_GERENCIAL); } }, title: 'Projetos', icon: '📐' },
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
  const capaOpen    = db.get('capa').filter(r => !['Encerrada', 'Não Procedente'].includes(r.status)).length;
  const rncOpen     = db.get('rnc').filter(r => !['Encerrada', 'Cancelada', 'Não Procedente'].includes(r.status)).length;
  const reclamOpen  = db.get('reclamacoes').filter(r => !['Concluída', 'Cancelada'].includes(r.status)).length;
  router.updateBadge(ROUTES.CAPA_GERENCIAL, capaOpen);
  router.updateBadge(ROUTES.RNC_GERENCIAL, rncOpen);
  router.updateBadge(ROUTES.RECLAM_GERENCIAL, reclamOpen);
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

