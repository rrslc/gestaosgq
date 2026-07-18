/**
 * @fileoverview Leitor mínimo de arquivos .xlsx — sem dependências externas.
 *
 * Um .xlsx é um arquivo ZIP contendo XMLs. Esta implementação descompacta o ZIP
 * usando a API nativa DecompressionStream ('deflate-raw') e faz o parse dos XMLs
 * com DOMParser — mantendo o app 100% offline e sem bibliotecas de ~500KB.
 *
 * Suporta: strings compartilhadas, strings inline, números, booleanos e datas
 * (serial do Excel convertido para AAAA-MM-DD, sistemas 1900 e 1904).
 * Lê a primeira planilha do arquivo.
 *
 * Exporta:
 *   readXlsx(file)  → { sheet, aoa }  — aoa = array de arrays (modo tabela).
 *   readCells(file) → { A1: '...', C8: '...', ... } — mapa por referência de
 *                     célula (modo formulário).
 */

// ── ZIP ────────────────────────────────────────────────────────────────────────

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Seu navegador não suporta leitura de .xlsx. Atualize o navegador ou salve a planilha como CSV.');
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/** Extrai um ZIP em memória. Retorna Map<nome, Promise<Uint8Array>> (bytes inflados). */
function parseZipEntries(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

  let eocd = -1;
  const minEocd = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minEocd; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Arquivo .xlsx inválido (ZIP não reconhecido).');

  const cdCount = dv.getUint16(eocd + 10, true);
  let   off     = dv.getUint32(eocd + 16, true);
  const entries = new Map();

  for (let n = 0; n < cdCount; n++) {
    if (dv.getUint32(off, true) !== 0x02014b50) break;
    const method     = dv.getUint16(off + 10, true);
    const compSize   = dv.getUint32(off + 20, true);
    const nameLen    = dv.getUint16(off + 28, true);
    const extraLen   = dv.getUint16(off + 30, true);
    const commentLen = dv.getUint16(off + 32, true);
    const localOff   = dv.getUint32(off + 42, true);
    const name       = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));

    const lNameLen  = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw       = buf.subarray(dataStart, dataStart + compSize);

    entries.set(name, method === 0 ? Promise.resolve(raw) : inflateRaw(raw));
    off += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readXml(entries, name) {
  const p = entries.get(name);
  if (!p) return null;
  const bytes = await p;
  const text  = new TextDecoder('utf-8').decode(bytes);
  return new DOMParser().parseFromString(text, 'application/xml');
}

// ── Datas ────────────────────────────────────────────────────────────────────

const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function isDateFormatCode(code) {
  if (!code) return false;
  const stripped = code.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '');
  return /[dmyhs]/i.test(stripped);
}

function excelSerialToISO(serial, date1904) {
  const epoch = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const ms    = epoch + Math.round(serial * 86400000);
  const d     = new Date(ms);
  const pad   = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

// ── Referências de célula ──────────────────────────────────────────────────────

function textOf(el) {
  return [...el.getElementsByTagName('t')].map(t => t.textContent).join('');
}

function refToRC(ref) {
  const m = (ref || '').match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let col = 0;
  for (const c of m[1]) col = col * 26 + (c.charCodeAt(0) - 64);
  return { col: col - 1, row: Number(m[2]) };
}

function indexToCol(idx) {
  let s = '';
  idx += 1;
  while (idx > 0) { const r = (idx - 1) % 26; s = String.fromCharCode(65 + r) + s; idx = Math.floor((idx - 1) / 26); }
  return s;
}

async function firstSheetPath(entries) {
  const wb = await readXml(entries, 'xl/workbook.xml');
  const rels = await readXml(entries, 'xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const sheet = wb.getElementsByTagName('sheet')[0];
    const rid = sheet?.getAttribute('r:id') || sheet?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    if (rid) {
      const rel = [...rels.getElementsByTagName('Relationship')].find(r => r.getAttribute('Id') === rid);
      const target = rel?.getAttribute('Target');
      if (target) return target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^\.\//, '');
    }
  }
  return 'xl/worksheets/sheet1.xml';
}

// ── Parse central ──────────────────────────────────────────────────────────────

/** Faz o parse da primeira planilha em um mapa { ref: valor }. */
async function parseWorkbook(file) {
  const buf     = new Uint8Array(await file.arrayBuffer());
  const entries = parseZipEntries(buf);

  const wbDoc    = await readXml(entries, 'xl/workbook.xml');
  const date1904 = wbDoc?.getElementsByTagName('workbookPr')[0]?.getAttribute('date1904') === '1';

  const sstDoc = await readXml(entries, 'xl/sharedStrings.xml');
  const shared = sstDoc ? [...sstDoc.getElementsByTagName('si')].map(textOf) : [];

  const stylesDoc = await readXml(entries, 'xl/styles.xml');
  const styleIsDate = [];
  if (stylesDoc) {
    const customFmt = {};
    [...stylesDoc.getElementsByTagName('numFmt')].forEach(nf => {
      customFmt[nf.getAttribute('numFmtId')] = nf.getAttribute('formatCode');
    });
    const cellXfs = stylesDoc.getElementsByTagName('cellXfs')[0];
    if (cellXfs) {
      [...cellXfs.getElementsByTagName('xf')].forEach((xf, i) => {
        const id = xf.getAttribute('numFmtId');
        styleIsDate[i] = BUILTIN_DATE_FMTS.has(Number(id)) || isDateFormatCode(customFmt[id]);
      });
    }
  }

  const sheetPath = await firstSheetPath(entries);
  const sheetDoc  = await readXml(entries, sheetPath);
  if (!sheetDoc) throw new Error('Não foi possível ler a planilha do arquivo.');

  const cells = {};
  let maxRow = 0, maxCol = 0, autoCol = 0, curRow = 0;

  [...sheetDoc.getElementsByTagName('row')].forEach(row => {
    curRow  = Number(row.getAttribute('r')) || (curRow + 1);
    autoCol = 0;
    [...row.getElementsByTagName('c')].forEach(c => {
      const ref  = c.getAttribute('r');
      const rc   = ref ? refToRC(ref) : null;
      const col  = rc ? rc.col : autoCol;
      const rnum = rc ? rc.row : curRow;
      autoCol    = col + 1;
      const type = c.getAttribute('t');
      let value  = '';

      if (type === 's') {
        const v = c.getElementsByTagName('v')[0];
        value = v ? (shared[Number(v.textContent)] ?? '') : '';
      } else if (type === 'inlineStr') {
        const is = c.getElementsByTagName('is')[0];
        value = is ? textOf(is) : '';
      } else if (type === 'str') {
        const v = c.getElementsByTagName('v')[0];
        value = v ? v.textContent : '';
      } else if (type === 'b') {
        const v = c.getElementsByTagName('v')[0];
        value = v && v.textContent === '1' ? 'Sim' : 'Não';
      } else if (type === 'e') {
        value = ''; // erro (#VALUE! etc.) → ignora
      } else {
        const v = c.getElementsByTagName('v')[0];
        if (v) {
          const s = Number(c.getAttribute('s'));
          value = (!Number.isNaN(s) && styleIsDate[s]) ? excelSerialToISO(Number(v.textContent), date1904) : v.textContent;
        }
      }

      value = String(value ?? '').trim();
      if (value !== '') {
        cells[indexToCol(col) + rnum] = value;
        if (rnum > maxRow) maxRow = rnum;
        if (col + 1 > maxCol) maxCol = col + 1;
      }
    });
  });

  return { sheet: sheetPath, cells, maxRow, maxCol };
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Lê a primeira planilha como tabela (array de arrays), incluindo o cabeçalho.
 * @returns {Promise<{ sheet: string, aoa: Array<Array<string>> }>}
 */
export async function readXlsx(file) {
  const { sheet, cells, maxRow, maxCol } = await parseWorkbook(file);
  const aoa = [];
  for (let r = 1; r <= maxRow; r++) {
    const line = [];
    for (let c = 0; c < maxCol; c++) line.push(cells[indexToCol(c) + r] ?? '');
    aoa.push(line);
  }
  while (aoa.length && aoa[0].every(x => x === '')) aoa.shift();
  while (aoa.length && aoa[aoa.length - 1].every(x => x === '')) aoa.pop();
  return { sheet, aoa };
}

/**
 * Lê a primeira planilha como mapa de células por referência (ex: cells['C8']).
 * @returns {Promise<Object<string,string>>}
 */
export async function readCells(file) {
  const { cells } = await parseWorkbook(file);
  return cells;
}
