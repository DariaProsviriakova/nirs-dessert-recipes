import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { asyncBufferFromFile, parquetReadObjects } from 'hyparquet';
import { compressors } from 'hyparquet-compressors';
import { normalizeNutrition, parsePositiveInteger, parseTimeMinutes } from '../src/recipe-utils.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.resolve(moduleDir, '../data/raw');
const outputDir = path.resolve(moduleDir, '../data/generated');
const outputPath = path.join(outputDir, 'dessert-corpus.jsonl');
const statsPath = path.join(outputDir, 'corpus-stats.json');
const aliasesPath = path.resolve(moduleDir, '../data/manual-aliases.json');
const manualAliases = JSON.parse(await readFile(aliasesPath, 'utf8'));
const files = (await readdir(rawDir)).filter((name) => name.endsWith('.parquet')).sort();
if (files.length === 0) throw new Error('No Parquet files found. Run npm run download first.');

const selectedCategoryNames = new Set([
  'Сладкие каши',
  'Сладкие блюда в аэрогриле',
  'Сладкий соус',
]);
const pastryCategoryPattern = /пирог|тарт/u;
const sweetFillingPattern = /яблок|яблоч|груш|слив|вишн|ягод|клубник|малин|черник|клюкв|персик|абрикос|фрукт|варень|джем|повидл|шоколад|какао|сгущ|изюм|кураг|мед|мёд|сладк|банан|ананас|лимон|цитрус|мак|орех/u;
const excludedCategoryPattern = /несладк|закусочн/iu;
const MAX_REASONABLE_SERVINGS = 1000;
const columns = [
  'title', 'page_url', 'main_image_url', 'description', 'kroshki', 'ingredients', 'cooking_time',
  'portions_count', 'cooking_steps', 'purposes', 'tags', 'tastes', 'nae_value',
];

function list(value) {
  return Array.isArray(value) ? value.filter((item) => item !== null && item !== undefined) : [];
}

function text(value) {
  return String(value ?? '').trim();
}

function sourceImageUrl(value) {
  const candidate = text(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !['povarenok.ru', 'www.povarenok.ru'].includes(url.hostname.toLowerCase())) return null;
    return url.href;
  } catch {
    return null;
  }
}

function chooseDessertCategory(row) {
  const categories = list(row.kroshki).map(text).filter(Boolean);
  const root = categories[0] ?? '';
  if (categories.some((category) => excludedCategoryPattern.test(category))) return null;
  if (root === 'Десерты') return 'dessert-tree';
  if (root === 'Выпечка' && categories.includes('Кексы')) return 'sweet-cupcakes';
  if (categories.some((category) => selectedCategoryNames.has(category))) return 'explicit-sweet-category';
  const isPastry = categories.some((category) => pastryCategoryPattern.test(category));
  const ingredientNames = list(row.ingredients).map((entry) => text(entry?.name)).join(' ');
  if (isPastry && sweetFillingPattern.test(text(row.title) + ' ' + ingredientNames)) return 'sweet-filled-pastry';
  return null;
}

function sourceIdFromUrl(url) {
  const match = String(url ?? '').match(/\/recipes\/show\/(\d+)/u);
  return match ? match[1] : null;
}

function normalizeRecipe(row, selectionReason) {
  const title = text(row.title);
  if (!title) return null;
  const sourceUrl = text(row.page_url) || null;
  const sourceId = sourceIdFromUrl(sourceUrl);
  const categories = list(row.kroshki).map(text).filter(Boolean);
  const ingredientEntries = list(row.ingredients)
    .map((entry) => ({
      name: text(entry?.name),
      amount: entry?.count === null || entry?.count === undefined ? null : text(entry.count),
    }))
    .filter((entry) => entry.name);
  const timeRaw = row.cooking_time === null || row.cooking_time === undefined ? null : text(row.cooking_time);
  const timeMinutes = parseTimeMinutes(timeRaw);
  const servingsRaw = row.portions_count === null || row.portions_count === undefined ? null : text(row.portions_count);
  const parsedServings = parsePositiveInteger(servingsRaw, MAX_REASONABLE_SERVINGS);
  const servingsAnomaly = Boolean(servingsRaw) && parsedServings === null;
  const id = sourceId
    ? 'povarenok-' + sourceId
    : 'povarenok-' + createHash('sha256').update(title + '|' + categories.join('|')).digest('hex').slice(0, 16);

  return {
    id,
    sourceUrl,
    imageUrl: sourceImageUrl(row.main_image_url),
    title,
    description: text(row.description),
    categories,
    rootCategory: categories[0] ?? null,
    ingredients: ingredientEntries,
    ingredientNames: ingredientEntries.map((entry) => entry.name),
    steps: list(row.cooking_steps).map(text).filter(Boolean),
    tags: list(row.tags).map(text).filter(Boolean),
    tastes: list(row.tastes).map(text).filter(Boolean),
    purposes: list(row.purposes).map(text).filter(Boolean),
    timeRaw,
    timeMinutes,
    timeAnomaly: timeMinutes !== null && timeMinutes > 1440,
    servingsRaw,
    servings: parsedServings,
    servingsAnomaly,
    nutrition: normalizeNutrition(row.nae_value),
    aliases: manualAliases[id] ?? [],
    selectionReason,
  };
}

const records = new Map();
const counters = {
  totalRows: 0,
  selectedRows: 0,
  skippedRows: 0,
  duplicateIds: 0,
  selectedByReason: {},
  selectedByRoot: {},
};

for (const filename of files) {
  const rows = await parquetReadObjects({
    file: await asyncBufferFromFile(path.join(rawDir, filename)),
    columns,
    compressors,
  });
  counters.totalRows += rows.length;
  for (const row of rows) {
    const selectionReason = chooseDessertCategory(row);
    if (!selectionReason) continue;
    const recipe = normalizeRecipe(row, selectionReason);
    if (!recipe) {
      counters.skippedRows += 1;
      continue;
    }
    if (records.has(recipe.id)) {
      counters.duplicateIds += 1;
      continue;
    }
    records.set(recipe.id, recipe);
    counters.selectedByReason[selectionReason] = (counters.selectedByReason[selectionReason] ?? 0) + 1;
    counters.selectedByRoot[recipe.rootCategory] = (counters.selectedByRoot[recipe.rootCategory] ?? 0) + 1;
  }
  console.log('Processed ' + filename + ': ' + rows.length + ' rows');
}

const recipes = [...records.values()].sort((a, b) => a.id.localeCompare(b.id, 'en'));
counters.selectedRows = recipes.length;
const fieldCoverage = {
  timePresent: recipes.filter((recipe) => recipe.timeMinutes !== null).length,
  timeOutliersOver24h: recipes.filter((recipe) => recipe.timeAnomaly).length,
  servingsPresent: recipes.filter((recipe) => recipe.servings !== null).length,
  imagePresent: recipes.filter((recipe) => recipe.imageUrl !== null).length,
  servingsUnusable: recipes.filter((recipe) => recipe.servingsAnomaly).length,
  nutritionPer100gPresent: recipes.filter((recipe) => recipe.nutrition.per100g).length,
  nutritionWholeDishPresent: recipes.filter((recipe) => recipe.nutrition.wholeDish).length,
  nutritionPerServingPresent: recipes.filter((recipe) => recipe.nutrition.perServing).length,
  completeNutritionPer100g: recipes.filter((recipe) => recipe.nutrition.per100g && Object.values(recipe.nutrition.per100g).every((value) => value !== null)).length,
  completeNutritionPerServing: recipes.filter((recipe) => recipe.nutrition.perServing && Object.values(recipe.nutrition.perServing).every((value) => value !== null)).length,
  withIngredients: recipes.filter((recipe) => recipe.ingredientNames.length > 0).length,
  withSteps: recipes.filter((recipe) => recipe.steps.length > 0).length,
};
const nutritionCoverage = {};
for (const [key, count] of Object.entries(fieldCoverage)) {
  if (key.startsWith('nutrition') || key.startsWith('completeNutrition')) {
    nutritionCoverage[key] = { count, percent: recipes.length ? Number((count * 100 / recipes.length).toFixed(2)) : 0 };
  }
}
const stats = {
  dataset: 'd0rj/povarenok_recipes_detail',
  manualAliasCount: Object.values(manualAliases).reduce((total, aliases) => total + aliases.length, 0),
  config: 'default',
  split: 'train',
  builtAt: new Date().toISOString(),
  normalization: {
    categoryPolicy: 'dessert root + explicit sweet categories + sweet-filling pies/tarts; exclude savory/unsweetened categories',
    timeOutlierMinutes: 1440,
    servingCountMaximum: MAX_REASONABLE_SERVINGS,
  },
  ...counters,
  fieldCoverage: Object.fromEntries(Object.entries(fieldCoverage).map(([key, count]) => [
    key,
    { count, percent: recipes.length ? Number((count * 100 / recipes.length).toFixed(2)) : 0 },
  ])),
  nutritionCoverage,
  sampleIds: recipes.slice(0, 10).map(({ id, title }) => ({ id, title })),
};

await mkdir(outputDir, { recursive: true });
const temporaryPath = outputPath + '.part';
await rm(temporaryPath, { force: true });
const stream = createWriteStream(temporaryPath, { encoding: 'utf8' });
for (const recipe of recipes) {
  if (!stream.write(JSON.stringify(recipe) + '\n')) await once(stream, 'drain');
}
stream.end();
await once(stream, 'finish');
await rename(temporaryPath, outputPath);
await writeFile(statsPath, JSON.stringify(stats, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  totalRows: counters.totalRows,
  selectedRows: counters.selectedRows,
  selectedByReason: counters.selectedByReason,
  selectedByRoot: counters.selectedByRoot,
  fieldCoverage: stats.fieldCoverage,
  outputPath,
  statsPath,
}, null, 2));
