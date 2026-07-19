/**
 * @fileoverview Importa uma CAPA a partir do formulário preenchido (.xlsx),
 * lendo as células por posição fixa do template F-SQ-016 (P-SQ-003) —
 * "FORMULÁRIO PARA REGISTRO DE CAPA" (POP-GQ-009).
 *
 * O template é detectado pelo código impresso em L2/B6 e pelo rótulo "CAPA"
 * em E4. Se uma revisão futura deslocar as células, o mapa precisará ser
 * revisado — por isso o leitor valida o template antes de importar.
 */

import { db } from '../db.js';
import { toast } from '../toast.js';
import { readCells } from '../xlsx.js';
import { ORIGENS_CAPA } from '../constants.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Checkbox de célula única: parênteses contendo "x" (ex: "( X )"). */
function checked(v) {
  return /\([^)]*x[^)]*\)/i.test(String(v || ''));
}

/** Em "( x ) Rótulo  ( ) Outro" retorna o rótulo marcado. */
function firstCheckedInline(text) {
  const re = /\(([^)]*)\)\s*([^(]*)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    if (/x/i.test(m[1])) return m[2].replace(/\s+/g, ' ').trim();
  }
  return '';
}

/** Remove o rótulo numerado à esquerda (ex.: "5. Descrição … problema:"). */
function stripDescricao(v) {
  return String(v || '')
    .replace(/^\s*\d*\.?\s*Descri[çc][ãa]o[^:]*:\s*/i, '')
    .trim();
}

/** "028/25" → "CAPA.028/25"; mantém se já vier "CAPA.xxx/xx". */
function normalizaNumero(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/capa/i.test(s)) return s.toUpperCase().replace(/\s+/g, '');
  const m = s.match(/(\d{1,3})\s*\/\s*(\d{2,4})/);
  return m ? `CAPA.${m[1].padStart(3, '0')}/${m[2]}` : s;
}

/** Converte serial do Excel (número puro) para AAAA-MM-DD; passa ISO adiante. */
function asDate(v) {
  const s = String(v || '').trim();
  if (!s || s === '-') return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);        // já ISO (readCells converteu)
  if (/^\d{4,6}$/.test(s)) {                                       // serial Excel (sistema 1900)
    const ms = Date.UTC(1899, 11, 30) + Number(s) * 86400000;
    const d = new Date(ms);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  return s;
}

/** Mapeia o "3. Tipo" marcado no formulário para uma origem do app. */
function mapOrigem(label) {
  const l = label.toLowerCase();
  if (l.includes('auditoria'))                       return 'Auditorias';
  if (l.includes('reclama'))                         return 'Reclamação de Cliente';
  if (l.includes('rnc') || l.includes('conform'))    return 'Não Conformidade / RNC';
  if (l.includes('fornecedor') || l.includes('qualifica')) return 'Qualificação de Fornecedores';
  if (l.includes('indicador') || l.includes('desempenho')) return 'Indicadores de Desempenho';
  if (l.includes('processo'))                        return 'Processo';
  return 'Outros'; // "Produto", "Outros - especificar", etc.
}

/** Extrai as linhas de uma tabela (Ações/Plano) dado o conjunto de linhas e colunas. */
function extractTable(cv, rows, cols) {
  const out = [];
  rows.forEach(r => {
    const row = {};
    let has = false;
    for (const [key, col] of Object.entries(cols)) {
      let val = cv(col + r);
      if (key === 'prazo' || key === 'dataRealizada') val = asDate(val);
      if (val && val !== '-') { row[key] = val; has = true; }
    }
    if (has && row.descricao) out.push(row);
  });
  return out;
}

const ABRANGENCIA_CELLS = [
  ['B13', 'Outro(s) Produto(s)'], ['E13', 'Outro(s) Lote(s)'], ['H13', 'Outra(s) Máquina(s)'],
  ['K13', 'Outro(s) Dispositivo(s) de Medição'], ['B14', 'Outro(s) Documento(s)'],
  ['E14', 'Não se aplica'], ['H14', 'Outro(s)'],
];

// Verificação de Eficácia é DEFINIDA (planejada) durante o Plano de Ação e só
// EXECUTADA depois — por isso a presença de eficácia planejada NÃO promove o
// status. Enquanto houver plano e a CAPA não estiver encerrada, o status é
// "Em Plano de Ação". A entrada em "Verificação de Eficácia" é decisão da GQ.
function inferStatus({ encerramento, plano, investigacao }) {
  if (encerramento) return 'Encerrada';
  if (plano)        return 'Em Plano de Ação';
  if (investigacao) return 'Em Investigação';
  return 'Aberta';
}

// ── Parse do template F-SQ-016 ─────────────────────────────────────────────────

function parseCapa(cv) {
  const origem = mapOrigem(firstCheckedInline(cv('C9')));
  const abrangencia = ABRANGENCIA_CELLS.filter(([ref]) => checked(cv(ref))).map(([, l]) => l);

  // 7. Ações de Contenção/Imediatas (17-21) + 8. Plano de correção (24-26)
  const acaoCols = { descricao: 'C', responsavel: 'H', prazo: 'J', dataRealizada: 'L', evidencia: 'M' };
  const acoesImediatas = [
    ...extractTable(cv, [17, 18, 19, 20, 21], acaoCols),
    ...extractTable(cv, [24, 25, 26], acaoCols),
  ].map(r => ({ ...r, situacao: r.dataRealizada ? 'Concluída' : '' }));

  // 14. Plano de Ação Corretiva (53-59)
  const plano = extractTable(cv, [53, 54, 55, 56, 57, 58, 59], acaoCols);
  // 18. Análise da Eficácia (70-72): C descrição, J responsável, L data prevista, M evidência
  const eficacia = extractTable(cv, [70, 71, 72],
    { descricao: 'C', verificadoPor: 'J', dataVerificacao: 'L', evidencia: 'M' });
  const planoCorretivoAcoes = [...plano, ...eficacia];

  const causaRaiz = [cv('C48'), cv('C49'), cv('C50')].filter(v => v && v !== '-').join('\n');
  const equipe = [cv('C29'), cv('I29'), cv('C30'), cv('I30'), cv('C31')].filter(v => v && v !== '-').join(', ');

  // 11. Análise dos 5 Porquês (primeiro bloco, linha 36)
  const porque1 = cv('E36'), porque2 = cv('G36'), porque3 = cv('I36'), porque4 = cv('K36'), porque5 = cv('M36');
  const investigacao = !!(causaRaiz || porque1 || cv('C28'));

  // Só encerra se houver uma data real de encerramento (a célula-rótulo "Data:"
  // não conta). Sem data confiável, mantém-se em Plano de Ação — a GQ encerra.
  const encRaw = asDate(cv('L76') || cv('M76'));
  const encerramento = /^\d{4}-\d{2}-\d{2}$/.test(encRaw) ? encRaw : '';

  return {
    numero: normalizaNumero(cv('C8')),
    dataAbertura: asDate(cv('L8')),
    responsavelAbertura: cv('F10'),
    area: '',
    origem,
    origemEspecificar: '',
    descricao: stripDescricao(cv('B11')),
    abrangencia,
    abrangenciaEspecificar: '',
    // Investigação
    liderInvestigacao: cv('C28') === '-' ? '' : cv('C28'),
    equipeInvestigacao: equipe,
    fontesInformacao: cv('B33') === '-' ? '' : cv('B33'),
    porque1: porque1 === '-' ? '' : porque1,
    porque2: porque2 === '-' ? '' : porque2,
    porque3: porque3 === '-' ? '' : porque3,
    porque4: porque4 === '-' ? '' : porque4,
    porque5: porque5 === '-' ? '' : porque5,
    causaRaiz,
    // Plano / eficácia
    acoesImediatas,
    planoCorretivoAcoes,
    dataEncerramento: encerramento,
    status: inferStatus({ encerramento, plano: plano.length, investigacao }),
  };
}

const TEMPLATE_DETECT = cv =>
  /f-?sq-?016/i.test(cv('L2')) || /f-?sq-?016/i.test(cv('B6')) ||
  /p-?sq-?003/i.test(cv('B6')) ||
  (/capa/i.test(cv('E4')) && /n[°º]?\s*capa/i.test(cv('B8')));

/**
 * Faz o parse do mapa de células em um registro de CAPA.
 * @returns {{ valid: boolean, warnings: string[], record: Object|null }}
 */
export function parseFormCapa(cells) {
  const cv = ref => String(cells[ref] || '').trim();

  if (!TEMPLATE_DETECT(cv)) {
    return {
      valid: false, record: null,
      warnings: ['Não reconheci o template deste formulário (esperado F-SQ-016 / P-SQ-003 — formulário de CAPA). Confira se selecionou o arquivo correto.'],
    };
  }

  const record = parseCapa(cv);
  const warnings = [];
  if (!record.numero)    warnings.push('Número da CAPA não encontrado.');
  if (!record.descricao) warnings.push('Descrição da ocorrência não encontrada.');
  if (!ORIGENS_CAPA.includes(record.origem)) warnings.push(`Origem "${record.origem}" não está na lista padrão — revise após importar.`);

  return { valid: true, warnings, record };
}

// ── Acompanhamento de ações (capaAcoes) ─────────────────────────────────────────

/**
 * Cria registros de acompanhamento (capaAcoes) para as ações da CAPA importada.
 * Ações sem data de conclusão entram como "Pendente"; com data, "Concluída".
 * @returns {number} nº de ações pendentes criadas
 */
function trackAcoes(saved, record) {
  const linhas = [
    ...(record.acoesImediatas || []).map(a => ({ ...a, etapa: 'Ação Imediata' })),
    ...(record.planoCorretivoAcoes || []).map(a => ({
      ...a,
      etapa: (a.verificadoPor || a.dataVerificacao) ? 'Verificação de Eficácia' : 'Ação',
    })),
  ];
  linhas.forEach(a => {
    if (!a.descricao) return;
    const concluida = a.dataRealizada || a.dataConclusao || '';
    db.add('capaAcoes', {
      capaId: saved.id, capaNumero: saved.numero,
      acao: a.descricao,
      responsavel: a.responsavel || a.verificadoPor || '',
      prazo: a.prazo || a.dataVerificacao || '',
      status: concluida ? 'Concluída' : 'Pendente',
      etapa: a.etapa,
      evidencia: a.evidencia || '',
      dataConclusao: concluida,
    });
  });
  return linhas.filter(a => a.descricao && !(a.dataRealizada || a.dataConclusao)).length;
}

// ── UI ──────────────────────────────────────────────────────────────────────────

export function openImportFormCapaModal(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'align-items:flex-start;padding:20px;overflow-y:auto';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:720px;width:100%;margin:auto">
      <div class="modal-header">
        <h3 style="margin:0;font-size:1rem">Importar Formulário de CAPA</h3>
        <button class="modal-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div class="modal-body" id="imc-body">
        <div style="padding:24px;text-align:center">
          <div style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;line-height:1.5">
            Selecione o arquivo <strong>.xlsx</strong> do formulário de CAPA preenchido.<br>
            Reconhece o template <strong>F-SQ-016 (P-SQ-003)</strong>.
          </div>
          <input type="file" id="imc-file" accept=".xlsx" style="font-size:0.85rem">
          <div id="imc-error" style="display:none;margin-top:12px;padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:0.8rem;color:#991b1b"></div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary" id="imc-cancel">Cancelar</button>
        <button class="btn btn-primary" id="imc-go" style="display:none">Importar CAPA</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#imc-cancel').addEventListener('click', close);

  const errEl = overlay.querySelector('#imc-error');
  const goBtn = overlay.querySelector('#imc-go');
  let parsed = null;

  overlay.querySelector('#imc-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    errEl.style.display = 'none';
    try {
      const cells = await readCells(file);
      const res = parseFormCapa(cells);
      if (!res.valid) { errEl.textContent = res.warnings.join(' '); errEl.style.display = 'block'; goBtn.style.display = 'none'; return; }
      parsed = res;
      renderPreview(res);
    } catch (err) {
      errEl.textContent = 'Erro ao ler o formulário: ' + err.message;
      errEl.style.display = 'block';
    }
  });

  function fdate(v) {
    if (!v) return '—';
    const [y, m, d] = String(v).split('-');
    return d ? `${d}/${m}/${y}` : v;
  }

  function renderPreview({ record, warnings }) {
    const dup = db.get('capa').some(r => String(r.numero).trim() === record.numero);
    const linha = (label, val) => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="flex:0 0 170px;font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${label}</span>
      <span style="flex:1;font-size:0.82rem">${String(val ?? '').replace(/</g, '&lt;') || '—'}</span></div>`;

    const pendentes = [...record.acoesImediatas, ...record.planoCorretivoAcoes]
      .filter(a => a.descricao && !(a.dataRealizada || a.dataConclusao)).length;

    overlay.querySelector('#imc-body').innerHTML = `
      <div style="font-size:0.74rem;color:var(--muted);margin-bottom:10px">Template detectado: <strong>F-SQ-016 (P-SQ-003)</strong></div>
      ${dup ? `<div style="padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;font-size:0.8rem;color:#991b1b;margin-bottom:12px">⚠ Já existe uma CAPA com o número <strong>${record.numero}</strong>. A importação foi bloqueada para evitar duplicidade.</div>` : ''}
      ${warnings.length ? `<div style="padding:8px 12px;background:#fef3c7;border-radius:6px;font-size:0.78rem;color:#92400e;margin-bottom:12px">⚠ ${warnings.join('<br>')}</div>` : ''}
      <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Dados extraídos do formulário</div>
      ${linha('Número', record.numero)}
      ${linha('Data de Abertura', fdate(record.dataAbertura))}
      ${linha('Responsável', record.responsavelAbertura)}
      ${linha('Origem', record.origem)}
      ${linha('Descrição', (record.descricao || '').slice(0, 200) + ((record.descricao || '').length > 200 ? '…' : ''))}
      ${linha('Abrangência', record.abrangencia.join(', '))}
      ${linha('Líder Investigação', record.liderInvestigacao)}
      ${linha('Causa Raiz', (record.causaRaiz || '').slice(0, 160))}
      ${linha('Ações de Contenção', record.acoesImediatas.length + ' item(ns)')}
      ${linha('Plano / Verificação', record.planoCorretivoAcoes.length + ' item(ns)')}
      ${linha('Pendentes p/ acompanhamento', pendentes + ' ação(ões)')}
      ${linha('Encerramento', fdate(record.dataEncerramento))}
      ${linha('Status', record.status)}
    `;
    goBtn.style.display = dup ? 'none' : '';
  }

  goBtn.addEventListener('click', () => {
    if (!parsed) return;
    const saved = db.add('capa', parsed.record);
    const pendentes = trackAcoes(saved, parsed.record);
    close();
    toast(`CAPA ${parsed.record.numero} importada!${pendentes ? ` ${pendentes} ação(ões) pendente(s) no acompanhamento.` : ''}`);
    onDone?.();
  });
}
