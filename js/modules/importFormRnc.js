/**
 * @fileoverview Importa uma RNC a partir do formulário preenchido (.xlsx),
 * lendo as células por posição fixa do template. Suporta dois templates:
 *   - POP-GQ-008-01 (Revisão 00) — formulário novo
 *   - F-SQ-006 (Revisão 04, P-SQ-003) — formulário antigo
 *
 * O template é detectado pelo código impresso na célula L2. Se o layout de uma
 * revisão futura deslocar as células, o mapa precisará ser revisado — por isso o
 * leitor valida o template antes de importar e avisa em caso de incompatibilidade.
 */

import { db } from '../db.js';
import { toast } from '../toast.js';
import { readCells } from '../xlsx.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Checkbox de célula única: parênteses contendo "x" (ex: "( X )"). */
function checked(v) {
  return /\([^)]*x[^)]*\)/i.test(String(v || ''));
}

/**
 * Analisa uma célula com várias opções "( x ) Rótulo" e retorna o rótulo marcado.
 * Ex: "(   ) Processo  (   ) Produto  ( x ) Outros" → "Outros".
 */
function firstCheckedInline(text) {
  const re = /\(([^)]*)\)\s*([^(]*)/g;
  let m;
  while ((m = re.exec(String(text || '')))) {
    if (/x/i.test(m[1])) return m[2].replace(/\s+/g, ' ').trim();
  }
  return '';
}

function stripLabel(v) {
  return String(v || '').replace(/^\s*[\d.]*\s*(especificar|justificar|descrever)\s*:?\s*/i, '').trim();
}

function normalizaNumero(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/rnc/i.test(s)) return s.toUpperCase().replace(/\s+/g, '');
  const m = s.match(/(\d{1,3})\s*\/\s*(\d{2,4})/);
  return m ? `RNC.${m[1].padStart(3, '0')}/${m[2]}` : s;
}

const TIPOS_NC = ['Matéria-prima', 'Produto', 'Material de Embalagem', 'Processos', 'Equipamento', 'Documento', 'Reclamação de Cliente', 'Outros'];

/** Extrai as linhas de uma tabela (Ações/Plano) dado o conjunto de linhas e colunas. */
function extractTable(cv, rows, cols) {
  const out = [];
  rows.forEach(r => {
    const row = {};
    let has = false;
    for (const [key, col] of Object.entries(cols)) {
      const val = cv(col + r);
      if (val && val !== '-') { row[key] = val; has = true; }
    }
    if (has) out.push(row);
  });
  return out;
}

function inferStatus({ dataFechamento, verificacao, plano, disposicao, investigacao, procedente, severidade }) {
  if (dataFechamento) return 'Encerrada';
  if (verificacao) return 'Verificação de Eficácia';
  if (plano) return 'Em Plano de Ação';
  if (disposicao) return 'Em Disposição';
  if (investigacao) return 'Em Investigação';
  if (procedente === 'Não') return 'Não Procedente';
  if (procedente || severidade) return 'Em Avaliação';
  return 'Aberta';
}

// ── Template NOVO: POP-GQ-008-01 (Rev 00) ──────────────────────────────────────

const TIPO_CELLS_NEW = [
  ['C10', 'Matéria-prima'], ['G10', 'Produto'], ['K10', 'Material de Embalagem'],
  ['C14', 'Processos'], ['I14', 'Documento'], ['C15', 'Reclamação de Cliente'],
  ['I15', 'Equipamento'], ['C17', 'Outros'],
];
const ABRANGENCIA_CELLS = [
  ['B20', 'Outro(s) Produto(s)'], ['E20', 'Outro(s) Lote(s)'], ['H20', 'Outra(s) Máquina(s)'],
  ['K20', 'Outro(s) Dispositivo(s) de Medição'], ['B21', 'Outro(s) Documento(s)'],
  ['E21', 'Não se aplica'], ['H21', 'Outro(s)'],
];
const DISPOSICAO_CELLS_NEW = [
  ['B70', 'Retrabalho'], ['K70', 'Concessão'], ['B71', 'Rejeição'], ['H71', 'Não aplicável'],
];

function parseNew(cv) {
  const tipo = (TIPO_CELLS_NEW.find(([ref]) => checked(cv(ref))) || [])[1] || '';
  const abrangencia = ABRANGENCIA_CELLS.filter(([ref]) => checked(cv(ref))).map(([, l]) => l);
  const severidade    = checked(cv('C34')) ? 'Baixa' : checked(cv('E34')) ? 'Média' : checked(cv('G34')) ? 'Alta' : '';
  const probabilidade = checked(cv('C35')) ? 'Baixa' : checked(cv('E35')) ? 'Média' : checked(cv('G35')) ? 'Alta' : '';
  const procedente    = checked(cv('B37')) ? 'Sim' : checked(cv('F37')) ? 'Não' : '';
  const classificacao = checked(cv('D37')) ? 'Menor' : checked(cv('D38')) ? 'Maior' : checked(cv('D39')) ? 'Crítica' : '';
  const disposicao    = (DISPOSICAO_CELLS_NEW.find(([ref]) => checked(cv(ref))) || [])[1] || '';

  const acoesImediatas = extractTable(cv, [25, 26, 27, 28, 29],
    { descricao: 'C', responsavel: 'H', prazo: 'J', dataRealizada: 'L', evidencia: 'M' })
    .map(r => ({ ...r, situacao: r.dataRealizada ? 'Concluída' : '' }));

  const planoCols = { descricao: 'C', responsavel: 'F', prazo: 'I', dataRealizada: 'J', evidencia: 'K', verificadoPor: 'M', dataVerificacao: 'N' };
  const planoCorretivoAcoes = [...extractTable(cv, [76, 77], planoCols), ...extractTable(cv, [80, 81], planoCols)];

  const obs = [];
  const risco = cv('I34'); if (risco) obs.push('Análise de Risco: ' + risco);
  const just  = stripLabel(cv('J37')); if (just && procedente === 'Sim') obs.push('Avaliação: ' + just);

  const dataFechamento = cv('L89') || cv('M89');

  return {
    numero: normalizaNumero(cv('C8')),
    dataAbertura: cv('L8'),
    responsavel: cv('E9'),
    area: cv('L9'),
    tipo,
    produto: cv('I10') || cv('E10') || cv('M10'),
    lote: cv('I11') || cv('E11') || cv('M11'),
    dataFabricacao: cv('I13') || cv('E13') || cv('M13'),
    dataValidade: cv('I12') || cv('E12') || cv('M12'),
    descricao: cv('F18'),
    abrangencia,
    abrangenciaEspecificar: stripLabel(cv('B22')),
    acoesImediatas,
    recorrencia: checked(cv('D32')) ? 'Não' : checked(cv('B32')) ? 'Sim' : '',
    rncAnterior: cv('J32') === '-' ? '' : cv('J32'),
    severidade, probabilidade, procedente, classificacao,
    justificativaNP: procedente === 'Não' ? cv('J37') : '',
    disposicao,
    numFormularioRetrabalho: cv('G70'),
    disposicaoAprovadaPor: cv('D72'),
    dataAprovacaoDisposicao: cv('M72'),
    planoCorretivoAcoes,
    foiEficaz: dataFechamento ? 'Sim' : '',
    necessitaCapa: dataFechamento ? 'Não' : '',
    alteracaoDocumentos: /sim/i.test(cv('B84')) ? 'Sim' : /n[ãa]o/i.test(cv('B84')) ? 'Não' : '',
    codigosDocumentos: cv('H83'),
    impactoMSB: /sim/i.test(cv('B85')) ? 'Sim' : /n[ãa]o/i.test(cv('B85')) ? 'Não' : '',
    descricaoImpacto: cv('H84'),
    observacoes: obs.join('\n\n'),
    dataFechamento,
    status: inferStatus({ dataFechamento, verificacao: planoCorretivoAcoes.length, plano: planoCorretivoAcoes.length, disposicao, procedente, severidade }),
  };
}

// ── Template ANTIGO: F-SQ-006 (Rev 04) ─────────────────────────────────────────

const ABRANGENCIA_CELLS_OLD = [
  ['B14', 'Outro(s) Produto(s)'], ['E14', 'Outro(s) Lote(s)'], ['H14', 'Outra(s) Máquina(s)'],
  ['K14', 'Outro(s) Dispositivo(s) de Medição'], ['B15', 'Outro(s) Documento(s)'],
  ['E15', 'Não se aplica'], ['H15', 'Outro(s)'],
];

function mapTipoOld(label) {
  const l = label.toLowerCase();
  // "Outros - especificar: Material de Embalagem" → usa a especificação se for um tipo conhecido
  const espec = label.match(/especificar\s*:?\s*(.+)$/i)?.[1]?.trim();
  if (espec) { const hit = TIPOS_NC.find(t => t.toLowerCase() === espec.toLowerCase()); if (hit) return hit; }
  if (l.includes('processo')) return 'Processos';
  if (l.includes('produto'))  return 'Produto';
  if (l.includes('outros'))   return 'Outros';
  return label;
}

function parseOld(cv) {
  const desc12 = cv('B12').replace(/^\s*[\d.]*\s*descri[çc][ãa]o[^:]*:\s*/i, '').trim();
  const produto = desc12.match(/produto\s*:?\s*([^\n]+)/i)?.[1]?.trim() || '';
  const lote    = desc12.match(/lote\s*:?\s*([^\n]+)/i)?.[1]?.replace(/\.$/, '').trim() || '';

  const tipo = mapTipoOld(firstCheckedInline(cv('C10')));
  const abrangencia = ABRANGENCIA_CELLS_OLD.filter(([ref]) => checked(cv(ref))).map(([, l]) => l);

  const disposicao =
    checked(cv('B59')) ? 'Retrabalho' : checked(cv('D59')) ? 'Concessão' :
    checked(cv('F59')) ? 'Rejeição'   : checked(cv('H59')) ? 'Não aplicável' : '';
  const disposicaoJustificativa = cv('H59').match(/justificar\s*:?\s*(.+)$/i)?.[1]?.trim() || '';

  const acoesImediatas = extractTable(cv, [18, 19, 20, 21, 22],
    { descricao: 'C', responsavel: 'H', prazo: 'J', dataRealizada: 'L', evidencia: 'M' })
    .map(r => ({ ...r, situacao: r.dataRealizada ? 'Concluída' : '' }));

  // Plano de correção (15) + Análise da Eficácia (19) → tabela plano-acao do app
  const plano = extractTable(cv, [49, 50, 51, 52, 53, 54, 55, 56, 57],
    { descricao: 'C', responsavel: 'H', prazo: 'J', dataRealizada: 'L', evidencia: 'M' });
  const eficacia = extractTable(cv, [68, 69, 70],
    { descricao: 'C', verificadoPor: 'J', dataVerificacao: 'L', evidencia: 'M' });
  const planoCorretivoAcoes = [...plano, ...eficacia];

  const causaRaiz = [cv('C44'), cv('C45'), cv('C46')].filter(v => v && v !== '-').join('\n');
  const equipe    = [cv('C25'), cv('I25'), cv('C26'), cv('I26'), cv('C27'), cv('I27')].filter(Boolean).join(', ');

  const impChecked = firstCheckedInline(cv('B64'));
  const impactoMSB = /sim/i.test(impChecked) ? 'Sim' : /n[ãa]o/i.test(impChecked) ? 'Não' : '';

  const df = cv('L74') || cv('M74');
  const dataFechamento = /^\d{4}-\d{2}-\d{2}/.test(df) ? df : '';

  return {
    numero: normalizaNumero(cv('C8')),
    dataAbertura: cv('C9'),
    responsavel: cv('F11'),
    area: '',
    tipo,
    produto,
    lote,
    descricao: desc12,
    abrangencia,
    abrangenciaEspecificar: '',
    acoesImediatas,
    recorrencia: /n[ãa]o\s*\(\s*x/i.test(cv('L8')) ? 'Não' : /sim\s*\(\s*x/i.test(cv('L8')) ? 'Sim' : '',
    rncAnterior: '',
    liderInvestigacao: cv('C24'),
    equipeInvestigacao: equipe,
    fontesInformacao: cv('B29'),
    causaRaiz,
    disposicao,
    disposicaoJustificativa,
    disposicaoAprovadaPor: cv('E60'),
    dataAprovacaoDisposicao: cv('M60'),
    planoCorretivoAcoes,
    alteracaoDocumentos: checked(cv('D62')) ? 'Sim' : checked(cv('B62')) ? 'Não' : '',
    codigosDocumentos: '',
    impactoMSB,
    descricaoImpacto: stripLabel(cv('B65')),
    dataFechamento,
    status: inferStatus({ dataFechamento, verificacao: eficacia.length, plano: plano.length, disposicao, investigacao: !!causaRaiz }),
  };
}

// ── Registro de templates ──────────────────────────────────────────────────────

const TEMPLATES = [
  {
    id: 'POP-GQ-008-01',
    detect: cv => /pop-?gq-?008-?01/i.test(cv('L2')) || /pop-?gq-?008/i.test(cv('B6')),
    parse: parseNew,
  },
  {
    id: 'F-SQ-006',
    detect: cv => /f-?sq-?006/i.test(cv('L2')) || /f-?sq-?006/i.test(cv('B6')),
    parse: parseOld,
  },
];

/**
 * Faz o parse do mapa de células em um registro de RNC, detectando o template.
 * @returns {{ valid: boolean, warnings: string[], template: string|null, record: Object|null }}
 */
export function parseFormRnc(cells) {
  const cv = ref => String(cells[ref] || '').trim();
  const tpl = TEMPLATES.find(t => t.detect(cv));

  if (!tpl) {
    return {
      valid: false, template: null, record: null,
      warnings: ['Não reconheci o template deste formulário (esperado POP-GQ-008-01 ou F-SQ-006). Confira se selecionou o arquivo correto do formulário de RNC.'],
    };
  }

  const record = tpl.parse(cv);
  const warnings = [];
  if (!record.numero)    warnings.push('Número da RNC não encontrado.');
  if (!record.descricao) warnings.push('Descrição da ocorrência não encontrada.');

  return { valid: true, template: tpl.id, warnings, record };
}

// ── UI ──────────────────────────────────────────────────────────────────────────

export function openImportFormRncModal(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'align-items:flex-start;padding:20px;overflow-y:auto';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:720px;width:100%;margin:auto">
      <div class="modal-header">
        <h3 style="margin:0;font-size:1rem">Importar Formulário de RNC</h3>
        <button class="modal-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div class="modal-body" id="imf-body">
        <div style="padding:24px;text-align:center">
          <div style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;line-height:1.5">
            Selecione o arquivo <strong>.xlsx</strong> do formulário de RNC preenchido.<br>
            Reconhece os templates <strong>POP-GQ-008-01</strong> (novo) e <strong>F-SQ-006</strong> (antigo).
          </div>
          <input type="file" id="imf-file" accept=".xlsx" style="font-size:0.85rem">
          <div id="imf-error" style="display:none;margin-top:12px;padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:0.8rem;color:#991b1b"></div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-secondary" id="imf-cancel">Cancelar</button>
        <button class="btn btn-primary" id="imf-go" style="display:none">Importar RNC</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#imf-cancel').addEventListener('click', close);

  const errEl = overlay.querySelector('#imf-error');
  const goBtn = overlay.querySelector('#imf-go');
  let parsed = null;

  overlay.querySelector('#imf-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    errEl.style.display = 'none';
    try {
      const cells = await readCells(file);
      const res = parseFormRnc(cells);
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

  function renderPreview({ record, warnings, template }) {
    const dup = db.get('rnc').some(r => String(r.numero).trim() === record.numero);
    const linha = (label, val) => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="flex:0 0 150px;font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${label}</span>
      <span style="flex:1;font-size:0.82rem">${String(val ?? '').replace(/</g, '&lt;') || '—'}</span></div>`;

    overlay.querySelector('#imf-body').innerHTML = `
      <div style="font-size:0.74rem;color:var(--muted);margin-bottom:10px">Template detectado: <strong>${template}</strong></div>
      ${dup ? `<div style="padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;font-size:0.8rem;color:#991b1b;margin-bottom:12px">⚠ Já existe uma RNC com o número <strong>${record.numero}</strong>. A importação foi bloqueada para evitar duplicidade.</div>` : ''}
      ${warnings.length ? `<div style="padding:8px 12px;background:#fef3c7;border-radius:6px;font-size:0.78rem;color:#92400e;margin-bottom:12px">⚠ ${warnings.join('<br>')}</div>` : ''}
      <div style="font-size:0.72rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Dados extraídos do formulário</div>
      ${linha('Número', record.numero)}
      ${linha('Data de Abertura', fdate(record.dataAbertura))}
      ${linha('Responsável', record.responsavel)}
      ${linha('Área', record.area)}
      ${linha('Tipo de NC', record.tipo)}
      ${linha('Produto / Nome', record.produto)}
      ${linha('Lote', record.lote)}
      ${linha('Descrição', (record.descricao || '').slice(0, 200) + ((record.descricao || '').length > 200 ? '…' : ''))}
      ${linha('Abrangência', record.abrangencia.join(', '))}
      ${linha('Ações de Contenção', record.acoesImediatas.length + ' item(ns)')}
      ${linha('Disposição', record.disposicao)}
      ${linha('Plano / Verificação', record.planoCorretivoAcoes.length + ' item(ns)')}
      ${linha('Data de Fechamento', fdate(record.dataFechamento))}
      ${linha('Status', record.status)}
    `;
    goBtn.style.display = dup ? 'none' : '';
  }

  goBtn.addEventListener('click', () => {
    if (!parsed) return;
    db.add('rnc', parsed.record);
    close();
    toast(`RNC ${parsed.record.numero} importada do formulário!`);
    onDone?.();
  });
}
