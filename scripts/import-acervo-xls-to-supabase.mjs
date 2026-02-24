import fs from 'node:fs';
import path from 'node:path';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const INPUT_FILE = process.argv[2] || '/home/nt/Downloads/acervos_cadastrados.xls';
const DRY_RUN = process.argv.includes('--dry-run');

const readEnvFile = () => {
  const envPath = path.resolve('.env');
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const entries = [...raw.matchAll(/^([A-Z0-9_]+)=["']?(.*?)["']?$/gm)].map((m) => [m[1], m[2]]);
  return Object.fromEntries(entries);
};

const envFile = readEnvFile();
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || envFile.VITE_SUPABASE_URL || envFile.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('SUPABASE_URL ausente. Defina SUPABASE_URL ou VITE_SUPABASE_URL.');
  process.exit(1);
}

if (!SUPABASE_SERVICE_ROLE_KEY && !DRY_RUN) {
  console.error('SUPABASE_SERVICE_ROLE_KEY ausente. Use --dry-run para só validar o arquivo.');
  process.exit(1);
}

if (!fs.existsSync(INPUT_FILE)) {
  console.error(`Arquivo não encontrado: ${INPUT_FILE}`);
  process.exit(1);
}

const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const findColumnIndex = (headers, aliases) =>
  headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));

const detectHeaderRowIndex = (rows) =>
  rows.findIndex((row) => {
    const normalized = row.map(normalizeText);
    const hasTitle = normalized.some((h) => h.includes('titulo') || h.includes('livro') || h.includes('obra') || h.includes('nome'));
    const hasAuthor = normalized.some((h) => h.includes('autor'));
    const hasAnyMetadata = normalized.some((h) => h.includes('isbn') || h.includes('tombo') || h.includes('editora') || h.includes('categoria') || h.includes('ano'));
    return hasTitle && (hasAuthor || hasAnyMetadata);
  });

const normalizeYear = (rawAno, rawTitulo) => {
  const colYear = String(rawAno || '').match(/\b(18|19|20)\d{2}\b/);
  if (colYear) return colYear[0];
  const titleYear = String(rawTitulo || '').match(/\b(18|19|20)\d{2}\b/);
  return titleYear ? titleYear[0] : '';
};

const normalizeTitulo = (raw) =>
  String(raw || '')
    .replace(/\s*-\s*ano:\s*\d{4}\s*/gi, ' ')
    .replace(/\s*-\s*vol:\s*[^-]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const hasBookData = (livro) =>
  [livro.titulo, livro.autor, livro.area, livro.tombo, livro.editora, livro.ano, livro.sinopse].some((value) => String(value || '').trim());

const getRows = (filePath) => {
  const workbook = XLSX.readFile(filePath);
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
  const htmlCell = rawRows
    .flat()
    .find((cell) => typeof cell === 'string' && cell.toLowerCase().includes('<table'));

  if (!htmlCell) return rawRows;

  const html = String(htmlCell);
  const trMatches = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (trMatches.length === 0) return rawRows;

  const decode = (value) =>
    value
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;/g, "'")
      .replace(/&quot;/gi, '"')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .trim();

  return trMatches
    .map(([, tr]) => [...tr.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(([, cell]) => decode(cell)))
    .filter((row) => row.length > 0);
};

const mapLivroFromRow = (row, headers) => {
  const indices = {
    titulo: findColumnIndex(headers, ['titulo', 'livro', 'obra', 'nome']),
    autor: findColumnIndex(headers, ['autor', 'autores']),
    area: findColumnIndex(headers, ['area', 'categoria', 'assunto', 'genero', 'setor', 'tipo']),
    tombo: findColumnIndex(headers, ['tombo', 'isbn', 'codigo', 'cod', 'id acervo', 'id livro', 'id']),
    editora: findColumnIndex(headers, ['editora']),
    ano: findColumnIndex(headers, ['ano', 'ano publicacao', 'publicacao']),
    edicao: findColumnIndex(headers, ['edicao', 'edi']),
    vol: findColumnIndex(headers, ['vol', 'volume']),
    local: findColumnIndex(headers, ['local', 'estante', 'prateleira', 'sala']),
    sinopse: findColumnIndex(headers, ['sinopse', 'descricao', 'resumo']),
    estante: findColumnIndex(headers, ['estante']),
    prateleira: findColumnIndex(headers, ['prateleira']),
  };

  const getByIndex = (idx) => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '');

  const rawTitulo = getByIndex(indices.titulo);
  const titulo = normalizeTitulo(rawTitulo);
  const volumeFromTitle = rawTitulo.match(/\bvol[:\s]*([0-9]+)/i)?.[1] || '';
  const estante = getByIndex(indices.estante);
  const prateleira = getByIndex(indices.prateleira);
  const localBase = getByIndex(indices.local);
  const local = [localBase, estante && !localBase.includes(estante) ? `Estante ${estante}` : '', prateleira ? `Prateleira ${prateleira}` : '']
    .filter(Boolean)
    .join(' | ');

  return {
    titulo,
    autor: getByIndex(indices.autor),
    area: getByIndex(indices.area),
    tombo: getByIndex(indices.tombo) || null,
    editora: getByIndex(indices.editora),
    ano: normalizeYear(getByIndex(indices.ano), rawTitulo),
    edicao: getByIndex(indices.edicao),
    vol: getByIndex(indices.vol) || volumeFromTitle,
    local,
    sinopse: getByIndex(indices.sinopse),
    disponivel: true,
  };
};

const rows = getRows(INPUT_FILE);
const headerRowIndex = detectHeaderRowIndex(rows);
if (headerRowIndex < 0) {
  console.error('Não foi possível detectar cabeçalho da planilha.');
  process.exit(1);
}

const headers = rows[headerRowIndex].map((h) => normalizeText(h));
const livros = [];
for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
  const mapped = mapLivroFromRow(rows[i], headers);
  if (hasBookData(mapped) && mapped.titulo) livros.push(mapped);
}

const uniqueByTomboOrTitle = new Map();
for (const livro of livros) {
  const key = livro.tombo ? `tombo:${livro.tombo}` : `titulo:${normalizeText(livro.titulo)}|autor:${normalizeText(livro.autor)}`;
  if (!uniqueByTomboOrTitle.has(key)) uniqueByTomboOrTitle.set(key, livro);
}
const finalLivros = [...uniqueByTomboOrTitle.values()];

console.log(`Arquivo: ${path.basename(INPUT_FILE)}`);
console.log(`Linhas válidas encontradas: ${livros.length}`);
console.log(`Após deduplicação local: ${finalLivros.length}`);

if (DRY_RUN) {
  console.log('Dry run concluído. Nenhum dado foi inserido.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

let inserted = 0;
let failed = 0;
const batchSize = 200;

for (let i = 0; i < finalLivros.length; i += batchSize) {
  const batch = finalLivros.slice(i, i + batchSize);
  const { error } = await supabase.from('livros').upsert(batch, { onConflict: 'tombo', ignoreDuplicates: true });
  if (error) {
    failed += batch.length;
    console.error(`Falha no lote ${Math.floor(i / batchSize) + 1}:`, error.message);
  } else {
    inserted += batch.length;
  }
}

console.log(`Inseridos/aplicados: ${inserted}`);
console.log(`Falhas: ${failed}`);
