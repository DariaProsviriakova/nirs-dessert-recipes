import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(moduleDir, '../data/generated/dessert-corpus.jsonl');
const ids = new Set(process.argv.slice(2));
if (!ids.size) throw new Error('Pass one or more recipe IDs.');
for await (const line of createInterface({
  input: createReadStream(corpusPath, { encoding: 'utf8' }),
  crlfDelay: Infinity,
})) {
  if (!line) continue;
  const recipe = JSON.parse(line);
  if (ids.has(recipe.id)) {
    console.log(JSON.stringify({
      id: recipe.id,
      title: recipe.title,
      categories: recipe.categories,
      description: recipe.description,
      ingredients: recipe.ingredients,
      tags: recipe.tags,
      timeRaw: recipe.timeRaw,
      nutrition: recipe.nutrition,
    }, null, 2));
  }
}
