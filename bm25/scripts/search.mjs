import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseQuery } from '../src/query.mjs';
import { searchRecipes } from '../src/bm25.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(moduleDir, '../data/generated/bm25-index.json.gz');
const args = process.argv.slice(2);
const limitIndex = args.findIndex((arg) => arg === '--limit');
let limit = 10;
if (limitIndex >= 0) {
  limit = Number(args[limitIndex + 1]) || 10;
  args.splice(limitIndex, 2);
}
const query = args.join(' ').trim();
if (!query) {
  console.error('Usage: npm run search -- "шоколадный десерт до 30 минут" [--limit 10]');
  process.exitCode = 2;
} else {
  const index = JSON.parse(gunzipSync(await readFile(indexPath), { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
  const parsedQuery = parseQuery(query);
  if (parsedQuery.clarificationRequired) {
    const message = parsedQuery.clarificationRequired === 'nutritionBasis'
      ? 'Уточните, КБЖУ нужно указать на 100 г или на порцию.'
      : 'Укажите одну базу расчёта КБЖУ: на 100 г или на порцию.';
    console.log(JSON.stringify({ clarificationRequired: parsedQuery.clarificationRequired, message }, null, 2));
  } else {
    const results = searchRecipes(index, query, { ...parsedQuery, limit });
    console.log(JSON.stringify(results.map(({ recipe, score }) => ({
      id: recipe.id,
      title: recipe.title,
      sourceUrl: recipe.sourceUrl,
      timeMinutes: recipe.timeMinutes,
      servings: recipe.servings,
      nutrition: recipe.nutrition,
      score: Number(score.toFixed(6)),
    })), null, 2));
  }
}
