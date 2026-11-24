import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(moduleDir, '../data/generated/dessert-corpus.jsonl');
const ingredientCounts = new Map();
const tagCounts = new Map();
const categoryCounts = new Map();
for await (const line of createInterface({
  input: createReadStream(corpusPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})) {
  if (!line) continue;
  const recipe = JSON.parse(line);
  for (const ingredient of new Set(recipe.ingredientNames ?? [])) ingredientCounts.set(ingredient, (ingredientCounts.get(ingredient) ?? 0) + 1);
  for (const tag of new Set(recipe.tags ?? [])) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  for (const category of new Set(recipe.categories ?? [])) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
}
const sorter = (left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'ru');
console.log(JSON.stringify({
  topIngredients: [...ingredientCounts].sort(sorter).slice(0, 25),
  rareIngredientTerms: [...ingredientCounts].filter(([, count]) => count <= 5).sort(sorter).slice(0, 50),
  topTags: [...tagCounts].sort(sorter).slice(0, 30),
  rareTags: [...tagCounts].filter(([, count]) => count <= 10).sort(sorter).slice(0, 30),
  categories: [...categoryCounts].sort(sorter).slice(0, 40),
}, null, 2));
