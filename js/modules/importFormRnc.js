/**
 * @fileoverview Importa uma RNC a partir do formulário preenchido POP-GQ-008-01
 * (Relatório de Não Conformidade), lendo as células por posição fixa do template.
 *
 * O mapeamento reflete o layout do POP-GQ-008-01 Revisão 00. Se o Excel mudar de
 * revisão e deslocar linhas, o mapa precisará ser revisado — por isso o leitor
 * valida âncoras (rótulos conhecidos) antes de importar e avisa em caso de
 * incompatibilidade.
 */

import { db } from '../db.js';
import { toast } from '../toast.js';
import { readCells } from '../xlsx.js';

// ── Helpers de leitura ─────────────────────────────────────────────────────────

/** Marca de checkbox: parênteses contendo um "x" (ex: "( X )", "(  x  )"). */
function checked(v) {
  return /\([^)]*x[^)]*\)/i.test(String(v || ''));
}

function stripLabel(v) {
  // Remove prefixos tipo "Especificar:" / "Justificar:" do início do texto.
  return String(v || '').replace(/^\s*(especificar|justificar|descrever)\s*:?\s*/i, '').trim();
}

function normalizaNumero(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (/rnc/i.test(s)) return s.toUpperCase().replace(/\s+/g, '');
  // "014/26" → "RNC.014/26"
  const m = s.match(/(\d{1,3})\s*\/\s*(\d{2,4})/);
  return m ? `RNC.${m[1].padStart(3, '0')}/${m[2]}` : s;
}

// ── Extração do formulário ─────────────────────────────────────────────────────

const TIPO_CELLS = [
  ['C10', 'Matéria-prima'], ['G10', 'Produto'], ['K10', 'Material de Embalagem'],
  ['C14', 'Processos'], ['I14', 'Documento'], ['C15', 'Reclamação de Cliente'],
  ['I15', 'Equipamento'], ['C17', 'Outros'],
];

const ABRANGENCIA_CELLS = [
  ['B20', 'Outro(s) Produto(s)'], ['E20', 'Outro(s) Lote(s)'], ['H20', 'Outra(s) Máquina(s)'],
  ['K20', 'Outro(s) Dispositivo(s) de Medição'], ['B21', 'Outro(s) Documento(s)'],
  ['E21', 'Não se aplica'], ['H21', 'Outro(s)'],
];

const DISPOSICAO_CELLS = [
  ['B70', 'Retrabalho'], ['K70', 'Concessão'], ['B71', 'Rejeição'], ['H71', 'Não aplicável'],
];

/** Extrai as linhas de uma tabela do formulário (Ações de Contenção / Plano de Ação). */
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

/**
 * Faz o parse do mapa de células em um registro de RNC do app.
 * @returns {{ record: Object, warnings: string[], valid: boolean }}
 */
export function parseFormRnc(cells) {
  const cv = ref => String(cells[ref] || '').trim();
  const warnings = [];

  // Validação de template por âncoras conhecidas
  const anchorOk = /n.?\s*rnc/i.test(cv('B8')) || /identifica/i.test(cv('B7'));
  if (!anchorOk) {
    return { valid: false, warnings: ['Este arquivo não parece ser o formulário POP-GQ-008-01 (não encontrei os campos esperados). Confira se selecionou o arquivo correto.'], record: null };
  }

  const tipo = (TIPO_CELLS.find(([ref]) => checked(cv(ref))) || [])[1] || '';

  const abrangencia = ABRANGENCIA_CELLS.filter(([ref]) => checked(cv(ref))).map(([, label]) => label);

  const severidade   = checked(cv('C34')) ? 'Baixa' : checked(cv('E34')) ? 'Média' : checked(cv('G34')) ? 'Alta' : '';
  const probabilidade = checked(cv('C35')) ? 'Baixa' : checked(cv('E35')) ? 'Média' : checked(cv('G35')) ? 'Alta' : '';

  const procedente = checked(cv('B37')) ? 'Sim' : checked(cv('F37')) ? 'Não' : '';
  const classificacao = checked(cv('D37')) ? 'Menor' : checked(cv('D38')) ? 'Maior' : checked(cv('D39')) ? 'Crítica' : '';

  const disposicao = (DISPOSICAO_CELLS.find(([ref]) => checked(cv(ref))) || [])[1] || '';

  // Nome/lote/validade/fabricação ficam na coluna do tipo marcado (E=MP, I=Produto, M=Embalagem)
  const produto        = cv('I10') || cv('E10') || cv('M10');
  const lote           = cv('I11') || cv('E11') || cv('M11');
  const dataFabricacao = cv('I13') || cv('E13') || cv('M13');
  const dataValidade   = cv('I12') || cv('E12') || cv('M12');

  const acoesImediatas = extractTable(cv, [25, 26, 27, 28, 29], {
    descricao: 'C', responsavel: 'H', prazo: 'J', dataRealizada: 'L', evidencia: 'M',
  }).map(r => ({ ...r, situacao: r.dataRealizada ? 'Concluída' : '' }));

  // Plano de Ação (76-77) e Verificação de Eficácia (80-81) compartilham as colunas
  // da tabela plano-acao do app; unifica preservando a estrutura completa.
  const planoCols = { descricao: 'C', responsavel: 'F', prazo: 'I', dataRealizada: 'J', evidencia: 'K', verificadoPor: 'M', dataVerificacao: 'N' };
  const planoCorretivoAcoes = [
    ...extractTable(cv, [76, 77], planoCols),
    ...extractTable(cv, [80, 81], planoCols),
  ];

  // Narrativas sem campo dedicado no app → consolidadas em Observação
  const obs = [];
  const riscoTxt = cv('I34'); if (riscoTxt) obs.push('Análise de Risco: ' + riscoTxt);
  const justTxt  = stripLabel(cv('J37')); if (justTxt && procedente === 'Sim') obs.push('Avaliação: ' + justTxt);

  const dataFechamento = cv('L89') || cv('M89');

  // Status inferido pela etapa mais avançada preenchida
  let status = 'Aberta';
  if (dataFechamento) status = 'Encerrada';
  else if (planoCorretivoAcoes.length) status = 'Verificação de Eficácia';
  else if (disposicao) status = 'Em Disposição';
  else if (procedente === 'Não') status = 'Não Procedente';
  else if (procedente || severidade) status = 'Em Avaliação';

  const record = {
    numero: normalizaNumero(cv('C8')),
    dataAbertura: cv('L8'),
    responsavel: cv('E9'),
    area: cv('L9'),
    tipo,
    produto,
    lote,
    dataFabricacao,
    dataValidade,
    numeroREC: cv('E15') || cv('E16'),
    especificar: stripLabel(cv('E14')) || stripLabel(cv('E17')),
    descricao: cv('F18'),
    abrangencia,
    abrangenciaEspecificar: stripLabel(cv('B22')),
    acoesImediatas,
    recorrencia: checked(cv('D32')) ? 'Não' : checked(cv('B32')) ? 'Sim' : '',
    rncAnterior: cv('J32') === '-' ? '' : cv('J32'),
    severidade,
    probabilidade,
    procedente,
    classificacao,
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
    status,
  };

  if (!record.numero)    warnings.push('Número da RNC não encontrado (célula C8).');
  if (!record.descricao) warnings.push('Descrição da ocorrência não encontrada (célula F18).');

  return { valid: true, warnings, record };
}

// ── UI ──────────────────────────────────────────────────────────────────────────

export function openImportFormRncModal(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'align-items:flex-start;padding:20px;overflow-y:auto';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:720px;width:100%;margin:auto">
      <div class="modal-header">
        <h3 style="margin:0;font-size:1rem">Importar Formulário de RNC (POP-GQ-008-01)</h3>
        <button class="modal-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div class="modal-body" id="imf-body">
        <div style="padding:24px;text-align:center">
          <div style="font-size:0.85rem;color:var(--muted);margin-bottom:14px;line-height:1.5">
            Selecione o arquivo <strong>.xlsx</strong> do formulário POP-GQ-008-01 preenchido.<br>
            Os campos serão extraídos automaticamente para conferência antes de importar.
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

  function renderPreview({ record, warnings }) {
    const dup = db.get('rnc').some(r => String(r.numero).trim() === record.numero);
    const linha = (label, val) => `<div style="display:flex;gap:8px;padding:3px 0;border-bottom:1px solid var(--border)">
      <span style="flex:0 0 150px;font-size:0.72rem;color:var(--muted);text-transform:uppercase;letter-spacing:.03em">${label}</span>
      <span style="flex:1;font-size:0.82rem">${String(val ?? '').replace(/</g, '&lt;') || '—'}</span></div>`;

    overlay.querySelector('#imf-body').innerHTML = `
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
      ${linha('Descrição', record.descricao)}
      ${linha('Abrangência', record.abrangencia.join(', '))}
      ${linha('Ações de Contenção', record.acoesImediatas.length + ' item(ns)')}
      ${linha('Severidade × Prob.', [record.severidade, record.probabilidade].filter(Boolean).join(' × '))}
      ${linha('Procedente', record.procedente + (record.classificacao ? ` · ${record.classificacao}` : ''))}
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
