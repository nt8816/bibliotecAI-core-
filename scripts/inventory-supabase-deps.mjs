import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const scanRoots = ['src', 'supabase/functions'];
const outputDir = path.join(rootDir, 'docs', 'generated');
const jsonOutputPath = path.join(outputDir, 'supabase-dependency-inventory.json');
const markdownOutputPath = path.join(outputDir, 'supabase-dependency-summary.md');

const textExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);

const categoryRules = [
  { key: 'auth', label: 'Auth', pattern: /\bsupabase\.auth\.|\.auth\.getUser\(|\.auth\.admin\.|onAuthStateChange\(/g },
  { key: 'queries', label: 'Consultas', pattern: /\.from\('/g },
  { key: 'rpc', label: 'RPC', pattern: /\.rpc\('/g },
  { key: 'storage', label: 'Storage', pattern: /\.storage\.from\('/g },
  { key: 'functions', label: 'Edge Functions', pattern: /functions\.invoke\(|invokeEdgeFunction\('/g },
  { key: 'realtime', label: 'Realtime', pattern: /useRealtimeSubscription\(|channel\('/g },
];

async function walkFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return walkFiles(fullPath);
      if (!textExtensions.has(path.extname(entry.name))) return [];
      return [fullPath];
    }),
  );
  return nested.flat();
}

function createEmptyCounters() {
  return Object.fromEntries(categoryRules.map((rule) => [rule.key, 0]));
}

function countMatches(source, pattern) {
  const matches = source.match(pattern);
  return matches ? matches.length : 0;
}

function classifyFile(filePath, source) {
  const counters = createEmptyCounters();
  for (const rule of categoryRules) {
    counters[rule.key] = countMatches(source, rule.pattern);
  }
  const total = Object.values(counters).reduce((sum, value) => sum + value, 0);

  return {
    path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
    total,
    categories: counters,
  };
}

function buildTopFiles(files, categoryKey, limit = 15) {
  return [...files]
    .filter((file) => file.categories[categoryKey] > 0)
    .sort((a, b) => b.categories[categoryKey] - a.categories[categoryKey] || a.path.localeCompare(b.path, 'pt-BR'))
    .slice(0, limit)
    .map((file) => ({ path: file.path, count: file.categories[categoryKey] }));
}

function buildSummary(files) {
  const totals = createEmptyCounters();

  for (const file of files) {
    for (const rule of categoryRules) {
      totals[rule.key] += file.categories[rule.key];
    }
  }

  return {
    scannedFiles: files.length,
    totals,
    topFilesOverall: [...files]
      .filter((file) => file.total > 0)
      .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path, 'pt-BR'))
      .slice(0, 20)
      .map((file) => ({
        path: file.path,
        total: file.total,
        categories: file.categories,
      })),
    topFilesByCategory: Object.fromEntries(
      categoryRules.map((rule) => [rule.key, buildTopFiles(files, rule.key)]),
    ),
  };
}

function renderMarkdown(summary) {
  const lines = [];

  lines.push('# Inventario de Dependencias do Supabase');
  lines.push('');
  lines.push(`Arquivos analisados: **${summary.scannedFiles}**`);
  lines.push('');
  lines.push('## Totais por categoria');
  lines.push('');
  for (const rule of categoryRules) {
    lines.push(`- ${rule.label}: **${summary.totals[rule.key]}**`);
  }
  lines.push('');
  lines.push('## Arquivos mais acoplados');
  lines.push('');
  for (const file of summary.topFilesOverall) {
    lines.push(`- \`${file.path}\`: ${file.total} referencias`);
  }
  lines.push('');

  for (const rule of categoryRules) {
    lines.push(`## Top ${rule.label}`);
    lines.push('');
    const rows = summary.topFilesByCategory[rule.key];
    if (!rows.length) {
      lines.push('- Nenhuma ocorrencia.');
      lines.push('');
      continue;
    }
    for (const row of rows) {
      lines.push(`- \`${row.path}\`: ${row.count}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

async function main() {
  const allFiles = [];

  for (const relativeRoot of scanRoots) {
    const fullRoot = path.join(rootDir, relativeRoot);
    try {
      const stat = await fs.stat(fullRoot);
      if (stat.isDirectory()) {
        const files = await walkFiles(fullRoot);
        allFiles.push(...files);
      }
    } catch {
      // ignore missing roots
    }
  }

  const inventory = [];
  for (const filePath of allFiles) {
    const source = await fs.readFile(filePath, 'utf8');
    inventory.push(classifyFile(filePath, source));
  }

  inventory.sort((a, b) => b.total - a.total || a.path.localeCompare(b.path, 'pt-BR'));
  const summary = buildSummary(inventory);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(jsonOutputPath, JSON.stringify({ generatedAt: new Date().toISOString(), summary, files: inventory }, null, 2));
  await fs.writeFile(markdownOutputPath, renderMarkdown(summary));

  console.log(`Inventario salvo em ${path.relative(rootDir, jsonOutputPath)}`);
  console.log(`Resumo salvo em ${path.relative(rootDir, markdownOutputPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
