import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBm25Index } from '../src/bm25.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(moduleDir, '../data/generated/dessert-corpus.jsonl');
const outputDir = path.resolve(moduleDir, '../data/generated');
const outputPath = path.join(outputDir, 'bm25-index.json.gz');
const lines = (await readFile(corpusPath, 'utf8')).split(/\r?\n/u).filter(Boolean);
const recipes = lines.map((line) => JSON.parse(line));
if (recipes.length === 0) throw new Error('Corpus is empty. Run npm run corpus first.');

console.log('Building fielded BM25 index for ' + recipes.length + ' recipes');
const index = buildBm25Index(recipes);
await mkdir(outputDir, { recursive: true });
const compressed = gzipSync(Buffer.from(JSON.stringify(index)), { level: 9 });
await writeFile(outputPath, compressed);
console.log(JSON.stringify({
  documentCount: index.documentCount,
  vocabularySize: Object.keys(index.terms).length,
  compressedBytes: compressed.byteLength,
  outputPath,
}, null, 2));
