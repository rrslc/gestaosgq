/**
 * @fileoverview Importação de dados a partir de planilhas .xlsx (RNCs e Ações de RNC).
 * Usa o leitor nativo js/xlsx.js — sem dependências externas.
 *
 * Fluxo: escolher arquivo → mapear colunas (auto-detectado, ajustável) →
 * pré-visualizar → importar. GQ pode assim cadastrar em massa registros que
 * hoje vivem em planilhas, sem depender da abertura formal pelas áreas.
 */

import { db } from '../db.js';
import { toast } from '../toast.js';
import { getSession } from '../session.js';
import { readXlsx } from '../xlsx.js';

// ── Normalização / datas ──────────────────────────────────────────────────────

function norm(s) {
  return String(s ?? '').toLowerCase().normalize('NFD')
    .replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Converte a data para ISO (AAAA-MM-DD). Aceita ISO, DD/MM/AAAA e DD-MM-AAAA. */
function toISODate(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return '';
}

const RNC_STATUS = ['Aberta', 'Em Avaliação', 'Em Investigação', 'Em Disposição', 'Em Plano de Ação', 'Verificação de Eficácia', 'Encerrada', 'Não Procedente', 'Cancelada'];

function matchStatus(v, fallback) {
  const n = norm(v);
  if (!n) return fallback;
  return RNC_STATUS.find(s => norm(s) === n) || fallback;
}

// ── Configurações de importação ────────────────────────────────────────────────

const RNC_CONFIG = {
  tipo: 'rnc',
  collection: 'rnc',
  title: 'Importar RNCs de Planilha',
  singular: 'RNC',
  fields: [
    { key: 'numero',       label: 'Número',              syn: ['numero', 'n', 'num', 'numero rnc', 'rnc', 'codigo'] },
    { key: 'dataAbertura', label: 'Data de Abertura',     syn: ['data', 'data abertura', 'data de abertura', 'abertura'], date: true },
    { key: 'area',         label: 'Área',                 syn: ['area', 'setor', 'area setor'] },
    { key: 'tipo',         label: 'Tipo de NC',           syn: ['tipo', 'tipo nc', 'tipo de nc'] },
    { key: 'descricao',    label: 'Descrição',            syn: ['descricao', 'ocorrencia', 'problema', 'descricao da ocorrencia', 'descricao ocorrencia'], required: true },
    { key: 'responsavel',  label: 'Responsável',          syn: ['responsavel', 'resp', 'responsavel abertura'] },
    { key: 'status',       label: 'Status',               syn: ['status', 'situacao', 'etapa'] },
    { key: 'produto',      label: 'Produto / Processo',   syn: ['produto', 'nome', 'produto processo', 'nome produto'] },
    { key: 'lote',         label: 'Lote',                 syn: ['lote'] },
    { key: 'classificacao', label: 'Classificação',       syn: ['classificacao', 'classe', 'classificacao nc'] },
  ],
};

const ACOES_CONFIG = {
  tipo: 'acoes',
  collection: 'rncAcoes',
  title: 'Importar Ações de RNC',
  singular: 'ação',
  plural: 'ações',
  fields: [
    { key: 'rncNumero',    label: 'Nº da RNC (vínculo)',  syn: ['rnc', 'numero rnc', 'n rnc', 'rnc numero', 'numero da rnc', 'numero'], required: true },
    { key: 'acao',         label: 'Ação',                 syn: ['acao', 'descricao da acao', 'descricao acao', 'atividade', 'descricao'], required: true },
    { key: 'responsavel',  label: 'Responsável',          syn: ['responsavel', 'resp'] },
    { key: 'prazo',        label: 'Prazo',                syn: ['prazo', 'data', 'data prazo', 'prazo finalizacao'], date: true },
    { key: 'etapa',        label: 'Etapa',                syn: ['etapa'] },
    { key: 'status',       label: 'Status',               syn: ['status', 'situacao'] },
    { key: 'evidencia',    label: 'Evidência',            syn: ['evidencia', 'evidencia justificativa'] },
    { key: 'dataConclusao', label: 'Data de Conclusão',   syn: ['data conclusao', 'conclusao', 'realizado', 'data realizada'], date: true },
  ],
};

// ── Auto-mapeamento ────────────────────────────────────────────────────────────

function autoMap(fields, headers) {
  const normHeaders = headers.map(norm);
  const mapping = {};
  fields.forEach(f => {
    const cands = [f.key, ...(f.syn || [])].map(norm);
    // 1) match exato de cabeçalho normalizado; 2) cabeçalho que contém o sinônimo
    let idx = normHeaders.findIndex(h => cands.includes(h));
    if (idx < 0) idx = normHeaders.findIndex(h => h && cands.some(c => h.includes(c) || c.includes(h)));
    mapping[f.key] = idx;
  });
  return mapping;
}

// ── Construção de registros ────────────────────────────────────────────────────

function buildRncRecord(get, ctx) {
  const numero = get('numero') || ctx.nextNumero();
  return {
    record: {
      numero,
      dataAbertura: toISODate(get('dataAbertura')) || ctx.today,
      area: get('area'),
      tipo: get('tipo'),
      descricao: get('descricao'),
      produto: get('produto'),
      lote: get('lote'),
      classificacao: get('classificacao'),
      responsavel: get('responsavel') || ctx.userNome,
      status: matchStatus(get('status'), 'Aberta'),
    },
  };
}

function buildAcaoRecord(get, ctx) {
  const rncRef = String(get('rncNumero') || '').trim();
  const rnc = ctx.rncByNumero(rncRef);
  if (!rnc) return { skip: `RNC "${rncRef || '—'}" não encontrada` };
  return {
    record: {
      rncId: rnc.id, rncNumero: rnc.numero,
      acao: get('acao'),
      responsavel: get('responsavel'),
      prazo: toISODate(get('prazo')),
      etapa: get('etapa'),
      status: get('status') || 'Pendente',
      evidencia: get('evidencia'),
      dataConclusao: toISODate(get('dataConclusao')),
    },
  };
}

// ── UI ──────────────────────────────────────────────────────────────────────────

export function openImportRncModal(onDone)   { openImportModal(RNC_CONFIG, onDone); }
export function openImportAcoesModal(onDone)  { openImportModal(ACOES_CONFIG, onDone); }

function openImportModal(cfg, onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'align-items:flex-start;padding:20px;overflow-y:auto';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:820px;width:100%;margin:auto">
      <div class="modal-header">
        <h3 style="margin:0;font-size:1rem">${cfg.title}</h3>
        <button class="modal-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div class="modal-body" id="imp-body">
        <div style="padding:24px;text-align:center">
          <div style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;line-height:1.5">
            Selecione uma planilha <strong>.xlsx</strong> com uma linha de cabeçalho.<br>
            As colunas serão associadas automaticamente aos campos do sistema (você poderá ajustar).
          </div>
          <input type="file" id="imp-file" accept=".xlsx" style="font-size:0.85rem">
          <div id="imp-error" style="display:none;margin-top:12px;padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:0.8rem;color:#991b1b"></div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
        <span id="imp-summary" style="font-size:0.8rem;color:var(--muted)"></span>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" id="imp-cancel">Cancelar</button>
          <button class="btn btn-primary" id="imp-go" style="display:none">Importar</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#imp-cancel').addEventListener('click', close);

  const errEl  = overlay.querySelector('#imp-error');
  const goBtn  = overlay.querySelector('#imp-go');
  const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };

  let headers = [], dataRows = [], mapping = {};

  overlay.querySelector('#imp-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    errEl.style.display = 'none';
    try {
      const { aoa } = await readXlsx(file);
      if (aoa.length < 2) { showErr('A planilha precisa de um cabeçalho e pelo menos uma linha de dados.'); return; }
      headers  = aoa[0];
      dataRows = aoa.slice(1).filter(r => r.some(c => String(c).trim() !== ''));
      mapping  = autoMap(cfg.fields, headers);
      renderMapping();
    } catch (err) {
      showErr('Erro ao ler a planilha: ' + err.message);
    }
  });

  function renderMapping() {
    const colOpts = i => ['<option value="-1">— ignorar —</option>',
      ...headers.map((h, ci) => `<option value="${ci}" ${ci === i ? 'selected' : ''}>${String(h || `Coluna ${ci + 1}`).replace(/</g, '&lt;')}</option>`)
    ].join('');

    const rows = cfg.fields.map(f => `
      <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--border)">
        <label style="flex:0 0 190px;font-size:0.8rem;font-weight:600">${f.label}${f.required ? ' <span style="color:var(--red)">*</span>' : ''}</label>
        <select data-map="${f.key}" style="flex:1;font-size:0.8rem;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text)">
          ${colOpts(mapping[f.key])}
        </select>
      </div>`).join('');

    overlay.querySelector('#imp-body').innerHTML = `
      <div style="font-size:0.8rem;color:var(--muted);margin-bottom:12px">
        <strong>${dataRows.length}</strong> linha(s) de dados encontrada(s). Confira a associação das colunas:
      </div>
      <div style="margin-bottom:14px">${rows}</div>
      <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Pré-visualização (até 5 linhas)</div>
      <div id="imp-preview" style="overflow-x:auto"></div>`;

    overlay.querySelectorAll('[data-map]').forEach(sel => {
      sel.addEventListener('change', () => { mapping[sel.dataset.map] = Number(sel.value); renderPreview(); });
    });
    goBtn.style.display = '';
    renderPreview();
  }

  function ctxFor() {
    const rncs = db.get('rnc');
    const byNum = new Map(rncs.map(r => [String(r.numero).trim(), r]));
    let seq = rncs.length;
    const yy = String(new Date().getFullYear()).slice(2);
    const isoToday = new Date().toISOString().slice(0, 10);
    return {
      today: isoToday,
      userNome: getSession()?.nome ?? '',
      rncByNumero: n => byNum.get(String(n).trim()),
      nextNumero: () => `RNC.${String(++seq).padStart(3, '0')}/${yy}`,
    };
  }

  function eachRow(fn) {
    const ctx = ctxFor();
    dataRows.forEach((row, i) => {
      const get = key => {
        const idx = mapping[key];
        return idx != null && idx >= 0 ? String(row[idx] ?? '').trim() : '';
      };
      const built = cfg.tipo === 'rnc' ? buildRncRecord(get, ctx) : buildAcaoRecord(get, ctx);
      fn(built, i, ctx);
    });
  }

  function missingRequired() {
    return cfg.fields.filter(f => f.required && (mapping[f.key] == null || mapping[f.key] < 0)).map(f => f.label);
  }

  function renderPreview() {
    const prevEl = overlay.querySelector('#imp-preview');
    const miss = missingRequired();
    if (miss.length) {
      prevEl.innerHTML = `<div style="padding:8px 10px;background:#fef3c7;border-radius:6px;font-size:0.78rem;color:#92400e">
        Associe as colunas obrigatórias: <strong>${miss.join(', ')}</strong></div>`;
      goBtn.disabled = true; goBtn.style.opacity = '.5';
      overlay.querySelector('#imp-summary').textContent = '';
      return;
    }
    goBtn.disabled = false; goBtn.style.opacity = '1';

    const shownCols = cfg.fields.filter(f => mapping[f.key] >= 0);
    const preview = [];
    let skipCount = 0;
    eachRow((built, i) => {
      if (built.skip) { skipCount++; if (preview.length < 5) preview.push({ skip: built.skip }); return; }
      if (preview.length < 5) preview.push({ rec: built.record });
    });

    const head = shownCols.map(f => `<th style="border:1px solid var(--border);padding:3px 6px;font-size:0.7rem;background:var(--surface);text-align:left">${f.label}</th>`).join('');
    const body = preview.map(p => {
      if (p.skip) return `<tr><td colspan="${shownCols.length}" style="border:1px solid var(--border);padding:3px 6px;font-size:0.72rem;color:#b91c1c">⚠ ${p.skip} — será ignorada</td></tr>`;
      return `<tr>${shownCols.map(f => {
        const key = cfg.tipo === 'rnc' ? f.key : (f.key === 'rncNumero' ? 'rncNumero' : f.key);
        let v = p.rec[key] ?? (f.key === 'rncNumero' ? p.rec.rncNumero : '');
        return `<td style="border:1px solid var(--border);padding:3px 6px;font-size:0.72rem">${String(v ?? '').replace(/</g, '&lt;') || '—'}</td>`;
      }).join('')}</tr>`;
    }).join('');

    prevEl.innerHTML = `<table style="border-collapse:collapse;width:100%;min-width:520px"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    const plural = cfg.plural || (cfg.singular + 's');
    overlay.querySelector('#imp-summary').textContent =
      `${dataRows.length - skipCount} ${dataRows.length - skipCount === 1 ? cfg.singular : plural} a importar` +
      (skipCount ? ` · ${skipCount} ignorada(s)` : '');
    goBtn.textContent = `Importar ${dataRows.length - skipCount} ${dataRows.length - skipCount === 1 ? cfg.singular : plural}`;
  }

  goBtn.addEventListener('click', () => {
    if (goBtn.disabled) return;
    let added = 0, skipped = 0;
    eachRow(built => {
      if (built.skip) { skipped++; return; }
      db.add(cfg.collection, built.record);
      added++;
    });
    close();
    toast(`${added} ${added === 1 ? cfg.singular : (cfg.plural || cfg.singular + 's')} importada(s)${skipped ? ` · ${skipped} ignorada(s)` : ''}!`);
    onDone?.();
  });
}
