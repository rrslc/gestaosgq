/**
 * @fileoverview Funções puras de utilidade — sem side effects.
 */

import { PILL_MAP } from './constants.js';

/**
 * Formata uma string ISO para 'dd/mm/yyyy'.
 * @param {string} isoString
 * @returns {string}
 */
export function formatDate(isoString) {
  if (!isoString) return '—';
  const [y, m, d] = isoString.split('-');
  if (!y || !m || !d) return '—';
  return `${d}-${m}-${y}`;
}

/**
 * Retorna a data de hoje no formato 'yyyy-mm-dd'.
 * @returns {string}
 */
export function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Calcula quantos dias faltam (ou passaram) até uma data.
 * @param {string} isoString
 * @returns {number|null} positivo = dias restantes, negativo = atrasado, null = sem data
 */
export function daysLeft(isoString) {
  if (!isoString) return null;
  const target = new Date(isoString + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((target - now) / (1000 * 60 * 60 * 24));
}

/**
 * Gera um `<span>` de pill com a classe correta para o status.
 * @param {string} status
 * @returns {string} HTML
 */
export function statusPill(status) {
  const cls = PILL_MAP[status] ?? PILL_MAP['default'];
  return `<span class="pill ${cls}">${status}</span>`;
}

/**
 * Gera um `<span>` de pill para impacto/criticidade.
 * @param {string} value
 * @returns {string} HTML
 */
export function impactPill(value) {
  const cls = PILL_MAP[value] ?? PILL_MAP['default'];
  return `<span class="pill ${cls}">${value}</span>`;
}

/**
 * Gera a célula de prazo com badge colorida se atrasada ou próxima.
 * @param {string} isoString
 * @returns {string} HTML
 */
export function deadlineCell(isoString) {
  if (!isoString) return '<span class="deadline-ok">—</span>';
  const days = daysLeft(isoString);
  const label = formatDate(isoString);
  if (days === null) return `<span>${label}</span>`;
  if (days < 0) {
    return `<span class="deadline-badge deadline-late">⚠ ${label}</span>`;
  }
  if (days <= 7) {
    return `<span class="deadline-badge deadline-soon">⏰ ${label}</span>`;
  }
  return `<span class="deadline-ok">${label}</span>`;
}

/**
 * Gera uma barra de progresso.
 * @param {number} pct — 0 a 100
 * @param {string} [color] — 'blue' | 'green' | 'amber' | 'red' (default 'blue')
 * @returns {string} HTML
 */
export function progressBar(pct, color = 'blue') {
  const clamp = Math.max(0, Math.min(100, Number(pct) || 0));
  return `
    <div class="progress-wrap" title="${clamp}%">
      <div class="progress-bar progress-${color}" style="width:${clamp}%"></div>
    </div>
  `;
}

/**
 * Gera um estado vazio para tabelas/listas sem dados.
 * @param {string} msg
 * @returns {string} HTML
 */
export function emptyState(msg) {
  return `
    <div class="empty-state">
      <span class="empty-icon">📋</span>
      <p>${msg}</p>
    </div>
  `;
}

/**
 * Gera tags `<option>` para um `<select>`.
 * @param {readonly string[]|string[]} arr
 * @param {string} [selected]
 * @returns {string} HTML
 */
export function selectOptions(arr, selected = '') {
  return arr
    .map(v => `<option value="${v}"${v === selected ? ' selected' : ''}>${v}</option>`)
    .join('');
}
