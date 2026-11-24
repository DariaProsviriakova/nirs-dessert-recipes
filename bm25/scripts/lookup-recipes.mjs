import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(moduleDir, '../data/generated/dessert-corpus.jsonl');
const needle = process.argv.slice(2).join(' ').toLocaleLowerCase('ru-RU').trim();
const limit = Number(process.env.SWEETMATE_LOOKUP_LIMIT ?? 12);
const matches = [];
const input = createInterface({ input: createReadStream(corpusPath, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of input) {
  if (!line) continue;
  const recipe = JSON.parse(line);
  const titleMatch = recipe.title.toLocaleLowerCase('ru-RU').includes(needle);
  const searchable = [
    ...(recipe.ingredientNames ?? []), ...(recipe.tags ?? []), ...(recipe.categories ?? []),
  ].join(' ').toLocaleLowerCase('ru-RU');
  if (!titleMatch && !searchable.includes(needle)) continue;
  matches.push({
    titleMatch,
    id: recipe.id,
    title: recipe.title,
    categories: recipe.categories,
    timeMinutes: recipe.timeMinutes,
  });
}
matches.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || a.title.localeCompare(b.title, 'ru'));
console.log(JSON.stringify(matches.slice(0, limit), null, 2));
