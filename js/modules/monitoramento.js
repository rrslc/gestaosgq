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

const AREAS_GEMBA = ['Sala Limpa', 'Sala de Produção Inferior', 'Almoxarifado e Recebimento', 'Expedição', 'Laboratório de CQ', 'Escritório / GQ', 'Todas as Áreas'];
const STATUS_GEMBA = ['Programado', 'Realizado', 'Pendente Relatório', 'Cancelado'];
const METODOS_COLETA = ['Sedimentação (Placa Exposta)', 'Impactação (RCS / Impactador)', 'Swab de Superfície', 'Filtração de Ar', 'Combinado'];
const RESULTADO_MICRO = ['Aprovado — dentro do limite', 'Reprovado — fora do limite', 'Pendente', 'Inconclusivo'];

// ── Equipe — opções dinâmicas ────────────────────────────────────────────────

function withEquipe(fields) {
  const nomes = db.get('equipe').map(m => m.nome);
  return fields.map(f =>
    f.options === '__equipe__'
      ? { ...f, type: nomes.length ? 'select' : 'text', options: nomes }
      : f
  );
}

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

// ── Fields (Planejamento e Execução) ─────────────────────────────────────────

// Pragas
const FIELDS_PRAGA_PLAN = [
  { id: 'numero',       label: 'Nº do Serviço',             type: 'text',     required: true,  span: 1 },
  { id: 'responsavel',  label: 'Responsável Interno (MSB)', type: 'select',   required: true,  span: 1, options: '__equipe__' },
  { id: 'area',         label: 'Área(s) Atendida(s)',        type: 'text',     required: true,  span: 1 },
  { id: 'empresa',      label: 'Empresa Prestadora',         type: 'text',     required: true,  span: 1 },
  { id: 'tipo',         label: 'Tipo de Serviço',            type: 'select',   required: true,  span: 1, options: TIPOS_PRAGA },
  { id: 'dataAgendada', label: 'Data Agendada',              type: 'date',     required: true,  span: 1 },
  { id: 'proxima',      label: 'Próximo Serviço',            type: 'date',     required: false, span: 1 },
  { id: 'obs',          label: 'Instrução / Observação',     type: 'textarea', required: false, span: 2 },
];
const FIELDS_PRAGA_EXEC = [
  { id: 'dataRealizacao',    label: 'Data de Realização',    type: 'date',     required: true,  span: 1 },
  { id: 'tecnico',           label: 'Técnico da Empresa',    type: 'text',     required: false, span: 1 },
  { id: 'laudo',             label: 'Laudo / Certificado',   type: 'select',   required: false, span: 1, options: SIM_NAO },
  { id: 'numeroCertificado', label: 'Nº do Certificado',     type: 'text',     required: false, span: 1 },
  { id: 'obs',               label: 'Achados / Observações', type: 'textarea', required: false, span: 2 },
];

// Reservatório
const FIELDS_RESERVATORIO_PLAN = [
  { id: 'numero',       label: 'Nº do Serviço',              type: 'text',     required: true,  span: 1 },
  { id: 'responsavel',  label: 'Responsável Interno (MSB)',   type: 'select',   required: true,  span: 1, options: '__equipe__' },
  { id: 'empresa',      label: 'Empresa Prestadora',          type: 'text',     required: false, span: 1 },
  { id: 'volume',       label: 'Volume do Reservatório',      type: 'text',     required: false, span: 1 },
  { id: 'dataAgendada', label: 'Data Agendada',               type: 'date',     required: true,  span: 1 },
  { id: 'proxima',      label: 'Próxima Limpeza',             type: 'date',     required: false, span: 1 },
  { id: 'obs',          label: 'Instrução / Observação',      type: 'textarea', required: false, span: 2 },
];
const FIELDS_RESERVATORIO_EXEC = [
  { id: 'dataRealizacao',  label: 'Data da Limpeza',          type: 'date',     required: true,  span: 1 },
  { id: 'responsavelExec', label: 'Executado por',            type: 'select',   required: false, span: 1, options: '__equipe__' },
  { id: 'resultadoAgua',   label: 'Resultado da Análise de Água', type: 'select', required: false, span: 1, options: RESULTADO_AGUA },
  { id: 'laudo',           label: 'Laudo / Certificado',      type: 'select',   required: false, span: 1, options: SIM_NAO },
  { id: 'obs',             label: 'Observações',              type: 'textarea', required: false, span: 2 },
];

// Resíduos
const FIELDS_RESIDUO_PLAN = [
  { id: 'tipo',         label: 'Tipo de Resíduo',              type: 'select',   required: true,  span: 2, options: TIPOS_RESIDUO },
  { id: 'responsavel',  label: 'Responsável Interno (MSB)',    type: 'select',   required: true,  span: 1, options: '__equipe__' },
  { id: 'empresa',      label: 'Empresa Coletora',             type: 'text',     required: true,  span: 1 },
  { id: 'dataAgendada', label: 'Data Agendada para Coleta',    type: 'date',     required: true,  span: 1 },
  { id: 'obs',          label: 'Instrução / Observação',       type: 'textarea', required: false, span: 2 },
];
const FIELDS_RESIDUO_EXEC = [
  { id: 'dataColeta',  label: 'Data de Coleta',                type: 'date',     required: true,  span: 1 },
  { id: 'quantidade',  label: 'Quantidade / Peso',             type: 'text',     required: false, span: 1 },
  { id: 'mtr',         label: 'Nº MTR / Manifesto',           type: 'text',     required: false, span: 1 },
  { id: 'obs',         label: 'Observações',                   type: 'textarea', required: false, span: 2 },
];

// Microbiológico
const FIELDS_MICRO_PLAN = [
  { id: 'numero',         label: 'Nº do Serviço',             type: 'text',     required: true,  span: 1 },
  { id: 'responsavel',    label: 'Responsável Interno (MSB)', type: 'select',   required: true,  span: 1, options: '__equipe__' },
  { id: 'empresa',        label: 'Empresa Prestadora',        type: 'text',     required: true,  span: 1 },
  { id: 'areaMicro',      label: 'Área Monitorada',           type: 'select',   required: true,  span: 1, options: AREAS_MICRO },
  { id: 'metodoColeta',   label: 'Método de Coleta',          type: 'select',   required: false, span: 1, options: METODOS_COLETA },
  { id: 'limiteAceitavel',label: 'Limite Aceitável (ex: ≤ 100 UFC/m³)', type: 'text', required: false, span: 1 },
  { id: 'dataAgendada',   label: 'Data Agendada',             type: 'date',     required: true,  span: 1 },
  { id: 'proxima',        label: 'Próxima Coleta',            type: 'date',     required: false, span: 1 },
  { id: 'obs',            label: 'Instrução / Observação',    type: 'textarea', required: false, span: 2 },
];
const FIELDS_MICRO_EXEC = [
  { id: 'dataColeta',     label: 'Data da Coleta',            type: 'date',     required: true,  span: 1 },
  { id: 'resultado',      label: 'Resultado da Análise',      type: 'select',   required: false, span: 1, options: RESULTADO_MICRO },
  { id: 'valorEncontrado',label: 'Valor Encontrado',          type: 'text',     required: false, span: 1 },
  { id: 'laudo',          label: 'Laudo disponível',          type: 'select',   required: false, span: 1, options: SIM_NAO },
  { id: 'obs',            label: 'Observações / Ações Corretivas', type: 'textarea', required: false, span: 2 },
];

// Limpeza Mensal
const FIELDS_LIMPEZA_PLAN = [
  { id: 'numero',       label: 'Nº do Registro',             type: 'text',     required: true,  span: 1 },
  { id: 'area',         label: 'Área Programada',             type: 'select',   required: true,  span: 1, options: AREAS_LIMPEZA },
  { id: 'responsavel',  label: 'Responsável',                 type: 'select',   required: true,  span: 2, options: '__equipe__' },
  { id: 'tipo',         label: 'Tipo de Limpeza',             type: 'select',   required: true,  span: 1, options: TIPOS_LIMPEZA },
  { id: 'procedimento', label: 'Procedimento (POP)',          type: 'text',     required: false, span: 1 },
  { id: 'dataAgendada', label: 'Data Programada',             type: 'date',     required: true,  span: 1 },
  { id: 'proxima',      label: 'Próxima Limpeza',             type: 'date',     required: false, span: 1 },
];
const FIELDS_LIMPEZA_EXEC = [
  { id: 'dataRealizacao', label: 'Data de Realização',        type: 'date',     required: true,  span: 1 },
  { id: 'areaRealizada',  label: 'Área Higienizada',          type: 'select',   required: true,  span: 1, options: AREAS_LIMPEZA },
  { id: 'produto',        label: 'Produto(s) Utilizado(s)',   type: 'text',     required: false, span: 2 },
  { id: 'obs',            label: 'Observações',               type: 'textarea', required: false, span: 2 },
];

// ── Botões de fase (Planejamento → Execução) ──────────────────────────────────

function phaseBtns(r, area) {
  const executado = area.isExecuted(r);
  return `
    <button class="btn btn-secondary btn-sm" data-action="plan" data-id="${r.id}" title="Editar planejamento">✏</button>
    ${!executado
      ? `<button class="btn btn-primary btn-sm" data-action="exec" data-id="${r.id}" title="Registrar execução">▶ Executar</button>`
      : `<button class="btn btn-secondary btn-sm" data-action="pdf" data-id="${r.id}" title="Gerar relatório">📄 Relatório</button>`}
    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>`;
}

// ── Relatório PDF genérico ────────────────────────────────────────────────────

function gerarRelatorio(areaObj, r) {
  const planRows = areaObj.fields.map(f => ({ label: f.label, val: r[f.id] })).filter(x => x.val);
  const execRows = (areaObj.fieldsExec || []).map(f => ({ label: f.label, val: r[f.id] })).filter(x => x.val);
  const renderRows = rows => rows.map(row =>
    `<div class="field"><label>${row.label}</label><p>${row.val}</p></div>`
  ).join('');

  const w = window.open('', '_blank');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head>
    <meta charset="UTF-8"><title>Relatório — ${areaObj.label} ${r.numero || ''}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:11pt;color:#111;margin:0;padding:32px}
      h1{font-size:15pt;text-align:center;margin:0 0 4px}
      .sub{text-align:center;font-size:9pt;color:#555;margin-bottom:24px}
      .section{margin-bottom:18px}
      .section-title{font-weight:700;font-size:10pt;border-bottom:1.5px solid #1d4ed8;color:#1d4ed8;padding-bottom:3px;margin-bottom:10px;text-transform:uppercase;letter-spacing:.04em}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 24px}
      .field label{font-size:8.5pt;color:#555;font-weight:700;text-transform:uppercase;letter-spacing:.04em;display:block;margin-top:8px}
      .field p{margin:2px 0 0;font-size:10.5pt;border-bottom:1px solid #ddd;min-height:18px;padding-bottom:2px;white-space:pre-wrap}
      .sign-row{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:48px}
      .sign-box{border-top:1px solid #333;padding-top:6px;font-size:9pt;text-align:center}
      @media print{body{padding:16px}}
    </style>
  </head><body>
    <h1>MSB Brasil Dispositivos Médicos</h1>
    <div class="sub">Relatório de ${areaObj.label}${r.numero ? ' · ' + r.numero : ''}</div>
    <div class="section">
      <div class="section-title">1. Planejamento</div>
      <div class="grid">${renderRows(planRows)}</div>
    </div>
    ${execRows.length ? `<div class="section">
      <div class="section-title">2. Execução</div>
      <div class="grid">${renderRows(execRows)}</div>
    </div>` : ''}
    <div class="sign-row">
      <div class="sign-box">Responsável pela Execução</div>
      <div class="sign-box">Gestor GQ / Visto</div>
    </div>
    <div style="margin-top:32px;text-align:center;font-size:8pt;color:#aaa">
      Gerado pelo SGQ — MSB Brasil · ${new Date().toLocaleDateString('pt-BR')}
    </div>
    <script>window.print();<\/script>
  </body></html>`);
  w.document.close();
}

// ── Tabelas ───────────────────────────────────────────────────────────────────

function renderTabelaPragas(items, area) {
  if (!items.length) return emptyState('Nenhum registro de controle de pragas. Use "+ Planejar Serviço" para agendar.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Área</th><th>Empresa</th><th>Tipo</th>
        <th>Agendado</th><th>Realizado</th><th>Próximo</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.82rem">${r.area}</td>
            <td style="font-size:0.82rem">${r.empresa}</td>
            <td style="font-size:0.78rem;color:var(--muted)">${r.tipo}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataAgendada)}</td>
            <td style="font-size:0.82rem">${r.dataRealizacao ? formatDate(r.dataRealizacao) : '<span style="color:var(--muted)">—</span>'}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td>${statusPill(r.status || s)}</td>
            <td><div class="td-actions">${phaseBtns(r, area)}</div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaReservatorio(items, area) {
  if (!items.length) return emptyState('Nenhum registro de limpeza de reservatório. Use "+ Planejar Serviço" para agendar.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Responsável / Empresa</th><th>Volume</th>
        <th>Agendado</th><th>Realizado</th><th>Próxima</th><th>Análise</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          const cor = r.resultadoAgua === 'Aprovado' ? '#059669'
                    : r.resultadoAgua === 'Reprovado' ? '#dc2626' : '#d97706';
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.82rem">${r.responsavel}</td>
            <td style="font-size:0.82rem">${r.volume || '—'}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataAgendada)}</td>
            <td style="font-size:0.82rem">${r.dataRealizacao ? formatDate(r.dataRealizacao) : '<span style="color:var(--muted)">—</span>'}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td style="font-size:0.82rem;font-weight:600;color:${cor}">${r.resultadoAgua || '—'}</td>
            <td>${statusPill(r.status || s)}</td>
            <td><div class="td-actions">${phaseBtns(r, area)}</div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaResiduos(items, area) {
  if (!items.length) return emptyState('Nenhum registro de gerenciamento de resíduos. Use "+ Planejar Coleta" para agendar.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Tipo de Resíduo</th><th>Empresa Coletora</th>
        <th>Agendado</th><th>Coletado</th><th>Quantidade</th><th>MTR</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => `<tr>
          <td style="font-size:0.82rem;max-width:200px">${r.tipo}</td>
          <td style="font-size:0.82rem">${r.empresa}</td>
          <td style="font-size:0.82rem">${formatDate(r.dataAgendada)}</td>
          <td style="font-size:0.82rem">${r.dataColeta ? formatDate(r.dataColeta) : '<span style="color:var(--muted)">—</span>'}</td>
          <td style="font-size:0.82rem">${r.quantidade || '—'}</td>
          <td style="font-family:monospace;font-size:0.78rem">${r.mtr || '—'}</td>
          <td>${statusPill(r.status || 'Agendado')}</td>
          <td><div class="td-actions">${phaseBtns(r, area)}</div></td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaMicro(items, area) {
  if (!items.length) return emptyState('Nenhum registro de monitoramento microbiológico. Use "+ Planejar Coleta" para agendar.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Empresa</th><th>Área</th><th>Agendado</th>
        <th>Coletado</th><th>Próxima</th><th>Resultado</th><th>Laudo</th><th>Status</th><th>Ações</th>
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
            <td style="font-size:0.82rem">${formatDate(r.dataAgendada)}</td>
            <td style="font-size:0.82rem">${r.dataColeta ? formatDate(r.dataColeta) : '<span style="color:var(--muted)">—</span>'}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td style="font-size:0.78rem;font-weight:600;color:${corRes};max-width:130px">${r.resultado || '—'}</td>
            <td style="font-size:0.8rem;text-align:center">${r.laudo || '—'}</td>
            <td>${statusPill(r.status || s)}</td>
            <td><div class="td-actions">${phaseBtns(r, area)}</div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

function renderTabelaLimpeza(items, area) {
  if (!items.length) return emptyState('Nenhum registro de limpeza mensal. Use "+ Planejar Limpeza" para agendar.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Área</th><th>Responsável</th><th>Tipo</th>
        <th>Agendado</th><th>Realizado</th><th>Próxima</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => {
          const s = statusFromDate(r, 'proxima');
          return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.82rem">${r.area || '—'}</td>
            <td style="font-size:0.82rem">${r.responsavel}</td>
            <td style="font-size:0.82rem">${r.tipo || '—'}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataAgendada)}</td>
            <td style="font-size:0.82rem">${r.dataRealizacao ? formatDate(r.dataRealizacao) : '<span style="color:var(--muted)">—</span>'}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td>${statusPill(r.status || s)}</td>
            <td><div class="td-actions">${phaseBtns(r, area)}</div></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></div>`;
}

// Momento 1 — Planejamento
const FIELDS_GEMBA_PLAN = [
  { id: 'numero',       label: 'Nº do Registro',         type: 'text',     required: true,  span: 1 },
  { id: 'area',         label: 'Área a Visitar',          type: 'select',   required: true,  span: 1, options: AREAS_GEMBA },
  { id: 'responsavel',  label: 'Responsável pela Visita', type: 'select',   required: true,  span: 2, options: '__equipe__' },
  { id: 'dataPrograma', label: 'Data Programada',         type: 'date',     required: true,  span: 1 },
  { id: 'proxima',      label: 'Próxima Visita',          type: 'date',     required: false, span: 1 },
  { id: 'objetivo',     label: 'Objetivo da Visita',      type: 'textarea', required: false, span: 2 },
];

// Momento 2 — Execução
const FIELDS_GEMBA_EXEC = [
  { id: 'dataRealizacao',   label: 'Data de Realização',           type: 'date',     required: true,  span: 1 },
  { id: 'areaRealizada',    label: 'Área Visitada (realizado)',     type: 'select',   required: true,  span: 1, options: AREAS_GEMBA },
  { id: 'conformidades',    label: 'Conformidades Observadas',      type: 'textarea', required: false, span: 2 },
  { id: 'naoConformidades', label: 'Não Conformidades Identificadas', type: 'textarea', required: false, span: 2 },
  { id: 'acoes',            label: 'Ações Tomadas / Pendentes',     type: 'textarea', required: false, span: 2 },
  { id: 'obs',              label: 'Observações Gerais',            type: 'textarea', required: false, span: 2 },
];

function renderTabelaGemba(items, area) {
  if (!items.length) return emptyState('Nenhuma visita Gemba Walk registrada. Use "+ Planejar Visita" para agendar.');
  return `
    <div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Área</th><th>Responsável</th>
        <th>Programado</th><th>Realizado</th><th>Próxima</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>
        ${items.map(r => `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.82rem">${r.area || '—'}</td>
            <td style="font-size:0.82rem">${r.responsavel}</td>
            <td style="font-size:0.82rem">${formatDate(r.dataPrograma)}</td>
            <td style="font-size:0.82rem">${r.dataRealizacao ? formatDate(r.dataRealizacao) : '<span style="color:var(--muted)">—</span>'}</td>
            <td>${deadlineCell(r.proxima)}</td>
            <td>${statusPill(r.status || 'Programado')}</td>
            <td><div class="td-actions">${phaseBtns(r, area)}</div></td>
          </tr>`).join('')}
      </tbody>
    </table></div>`;
}

// ── Área config ───────────────────────────────────────────────────────────────

const AREAS = [
  {
    key: 'pragas',
    label: 'Controle de Pragas',
    col: 'pragas',
    fields: FIELDS_PRAGA_PLAN,
    fieldsExec: FIELDS_PRAGA_EXEC,
    statusOpts: STATUS_SERVICO,
    statusInit: 'Agendado',
    statusExec: 'Realizado',
    isExecuted: r => ['Realizado', 'Pendente Laudo', 'Concluído'].includes(r.status),
    renderTabela: renderTabelaPragas,
    filtro: (r, q) => ((r.numero||'') + (r.area||'') + (r.empresa||'')).toLowerCase().includes(q),
    statusFn: r => r.status || statusFromDate(r, 'proxima'),
    btnLabel: '+ Planejar Serviço',
  },
  {
    key: 'reservatorio',
    label: 'Limpeza de Reservatório',
    col: 'reservatorio',
    fields: FIELDS_RESERVATORIO_PLAN,
    fieldsExec: FIELDS_RESERVATORIO_EXEC,
    statusOpts: STATUS_SERVICO,
    statusInit: 'Agendado',
    statusExec: 'Realizado',
    isExecuted: r => ['Realizado', 'Pendente Laudo', 'Concluído'].includes(r.status),
    renderTabela: renderTabelaReservatorio,
    filtro: (r, q) => ((r.numero||'') + (r.responsavel||'')).toLowerCase().includes(q),
    statusFn: r => r.status || statusFromDate(r, 'proxima'),
    btnLabel: '+ Planejar Serviço',
  },
  {
    key: 'residuos',
    label: 'Gerenc. de Resíduos',
    col: 'residuos',
    fields: FIELDS_RESIDUO_PLAN,
    fieldsExec: FIELDS_RESIDUO_EXEC,
    statusOpts: STATUS_RESIDUO,
    statusInit: 'Agendado',
    statusExec: 'Coletado',
    isExecuted: r => ['Coletado', 'Pendente MTR', 'Concluído'].includes(r.status),
    renderTabela: renderTabelaResiduos,
    filtro: (r, q) => ((r.tipo||'') + (r.empresa||'') + (r.mtr||'')).toLowerCase().includes(q),
    statusFn: r => r.status || 'Agendado',
    btnLabel: '+ Planejar Coleta',
  },
  {
    key: 'microbiologico',
    label: 'Monit. Microbiológico',
    col: 'microbiologico',
    fields: FIELDS_MICRO_PLAN,
    fieldsExec: FIELDS_MICRO_EXEC,
    statusOpts: STATUS_SERVICO,
    statusInit: 'Agendado',
    statusExec: 'Realizado',
    isExecuted: r => ['Realizado', 'Pendente Laudo', 'Concluído'].includes(r.status),
    renderTabela: renderTabelaMicro,
    filtro: (r, q) => ((r.numero||'') + (r.empresa||'') + (r.areaMicro||'')).toLowerCase().includes(q),
    statusFn: r => r.status || statusFromDate(r, 'proxima'),
    btnLabel: '+ Planejar Coleta',
  },
  {
    key: 'limpezaMensal',
    label: 'Limpeza Mensal',
    col: 'limpezaMensal',
    fields: FIELDS_LIMPEZA_PLAN,
    fieldsExec: FIELDS_LIMPEZA_EXEC,
    statusOpts: STATUS_LIMPEZA,
    statusInit: 'Agendado',
    statusExec: 'Realizado',
    isExecuted: r => ['Realizado', 'Concluído'].includes(r.status),
    renderTabela: renderTabelaLimpeza,
    filtro: (r, q) => ((r.numero||'') + (r.area||'') + (r.responsavel||'')).toLowerCase().includes(q),
    statusFn: r => r.status || statusFromDate(r, 'proxima'),
    btnLabel: '+ Planejar Limpeza',
  },
  {
    key: 'gembaWalk',
    label: 'Gemba Walk',
    col: 'gembaWalk',
    fields: FIELDS_GEMBA_PLAN,
    fieldsExec: FIELDS_GEMBA_EXEC,
    statusOpts: STATUS_GEMBA,
    statusInit: 'Programado',
    statusExec: 'Realizado',
    isExecuted: r => ['Realizado', 'Pendente Relatório'].includes(r.status),
    renderTabela: renderTabelaGemba,
    filtro: (r, q) => ((r.numero||'') + (r.area||'') + (r.responsavel||'')).toLowerCase().includes(q),
    statusFn: r => r.status || statusFromDate(r, 'proxima'),
    btnLabel: '+ Planejar Visita',
    execDefaults: r => ({ areaRealizada: r.area }),
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

  container.querySelector('#mon-table-wrap').innerHTML = area.renderTabela(items, area);
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
      <button class="btn btn-primary" data-action="new">${area.btnLabel || '+ Novo Registro'}</button>
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
          title: `Planejamento — ${area.label}`,
          fields: withEquipe(area.fields),
          data: { status: area.statusInit || 'Agendado' },
          onSave: data => {
            db.add(area.col, { ...data, status: area.statusInit || 'Agendado' });
            toast('Registro criado!');
            renderContent(container);
          },
        });
      }

      // Editar planejamento
      if (action === 'plan') {
        const record = db.getById(area.col, numId);
        if (!record) return;
        openModal({
          title: `Editar Planejamento — ${record.numero || '#' + numId}`,
          fields: withEquipe(area.fields),
          data: record,
          onSave: data => {
            db.update(area.col, numId, data);
            toast('Planejamento atualizado!');
            renderContent(container);
          },
        });
      }

      // Registrar execução
      if (action === 'exec') {
        const record = db.getById(area.col, numId);
        if (!record) return;
        openModal({
          title: `Registrar Execução — ${record.numero || '#' + numId}`,
          fields: withEquipe(area.fieldsExec),
          data: area.execDefaults ? area.execDefaults(record) : {},
          onSave: data => {
            db.update(area.col, numId, { ...data, status: area.statusExec || 'Realizado' });
            toast('Execução registrada!');
            renderContent(container);
          },
        });
      }

      // Gerar relatório PDF
      if (action === 'pdf') {
        const record = db.getById(area.col, numId);
        if (record) gerarRelatorio(area, record);
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
