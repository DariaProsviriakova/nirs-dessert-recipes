import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/text.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(moduleDir, '../data/generated/dessert-corpus.jsonl');
const benchmarkPath = path.resolve(moduleDir, '../data/benchmark.json');
const recipes = (await readFile(corpusPath, 'utf8')).split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const token = (value) => tokenize(value)[0];
const annotations = recipes.map((recipe) => ({
  recipe,
  ingredients: new Set((recipe.ingredientNames ?? []).flatMap(tokenize)),
  tags: new Set((recipe.tags ?? []).flatMap(tokenize)),
  allText: new Set([
    recipe.title, recipe.description, ...(recipe.categories ?? []), ...(recipe.ingredientNames ?? []),
    ...(recipe.tags ?? []), ...(recipe.tastes ?? []), ...(recipe.purposes ?? []), ...(recipe.steps ?? []),
  ].flatMap(tokenize)),
}));

function requireRecipe(id) {
  const recipe = byId.get(id);
  if (!recipe) throw new Error('Benchmark target is missing from the corpus: ' + id);
  return recipe;
}

const manualTitleCases = [
  { id: 'title-souffle', type: 'title', query: 'творожно-банановое суфле', relevantIds: ['povarenok-101139'] },
  { id: 'title-vegan-pumpkin-pie', type: 'title', query: 'веганский тыквенный пирог', relevantIds: ['povarenok-100149'] },
  { id: 'title-banana-clown', type: 'title', query: 'банановый десерт клоун', relevantIds: ['povarenok-73098'] },
  { id: 'title-a-la-tiramisu', type: 'title', query: 'а-ля тирамису', relevantIds: ['povarenok-115755'] },
  { id: 'title-australian-banana-pie', type: 'title', query: 'австралийский банановый пирог', relevantIds: ['povarenok-100414'] },
];
for (const item of manualTitleCases) {
  for (const id of item.relevantIds) requireRecipe(id);
  item.labelMethod = 'ручная разметка: точное название/один целевой рецепт';
}

const aliasId = 'povarenok-4580';
requireRecipe(aliasId);
if (!(requireRecipe(aliasId).aliases ?? []).includes('яблочный бисквитный пирог')) {
  throw new Error('The configured manual alias is missing. Run npm run corpus after updating manual-aliases.json.');
}
const aliasCase = {
  id: 'alias-apple-sponge-pie',
  type: 'alias',
  query: 'яблочный бисквитный пирог',
  relevantIds: [aliasId],
  labelMethod: 'ручная разметка; alias хранится в data/manual-aliases.json',
};

const ingredientCases = ['пралине', 'профитроли'].map((queryTerm) => {
  const queryToken = token(queryTerm);
  return {
    id: 'ingredient-' + queryTerm,
    type: 'ingredient',
    query: queryTerm,
    relevantIds: annotations.filter((entry) => entry.ingredients.has(queryToken)).map((entry) => entry.recipe.id),
    labelMethod: 'все записи с точным токеном в ингредиентах',
  };
});
const tagCases = ['брауни', 'быстро'].map((queryTerm) => {
  const queryToken = token(queryTerm);
  return {
    id: 'tag-' + queryTerm,
    type: 'tag',
    query: queryTerm,
    relevantIds: annotations.filter((entry) => entry.tags.has(queryToken)).map((entry) => entry.recipe.id),
    labelMethod: 'все записи с точным токеном в исходных метках',
  };
});

const bananaTerm = token('банан');
const sugarTerm = token('сахар');
const bananaUnder30 = {
  id: 'ingredient-time-banana-under-30',
  type: 'ingredient-time',
  query: 'банан до 30 минут',
  relevantIds: annotations
    .filter(({ recipe, ingredients }) => ingredients.has(bananaTerm)
      && recipe.timeMinutes !== null && !recipe.timeAnomaly && recipe.timeMinutes <= 30)
    .map(({ recipe }) => recipe.id),
  labelMethod: 'точное совпадение ингредиента «банан» и нормализованное время <= 30 минут',
};
const bananaWithoutSugar = {
  id: 'negation-banana-without-sugar',
  type: 'negation',
  query: 'банан без сахара',
  relevantIds: annotations
    .filter(({ ingredients }) => ingredients.has(bananaTerm) && !ingredients.has(sugarTerm))
    .map(({ recipe }) => recipe.id),
  labelMethod: 'точное совпадение ингредиента «банан» без ингредиента со stem «сахар»',
};
const timeOnly = {
  id: 'time-only-under-20',
  type: 'time-filter',
  query: 'мне нужен рецепт до 20 минут',
  relevantIds: annotations
    .filter(({ recipe }) => recipe.timeMinutes !== null && !recipe.timeAnomaly && recipe.timeMinutes <= 20)
    .map(({ recipe }) => recipe.id),
  labelMethod: 'все записи с доступным временем <= 20 минут; выдача без текстового терма сортируется по времени',
};
const macroFilter = {
  id: 'macro-banana-under-200-kcal',
  type: 'nutrition-filter',
  query: 'банан до 200 ккал на 100 г',
  relevantIds: annotations
    .filter(({ recipe, ingredients }) => ingredients.has(bananaTerm)
      && recipe.nutrition?.per100g?.kcal !== null && recipe.nutrition?.per100g?.kcal <= 200)
    .map(({ recipe }) => recipe.id),
  labelMethod: 'точный ингредиент «банан» и естественно сформулированное ограничение КБЖУ на 100 г: ккал <= 200',
};
const perServingMacroFilter = {
  id: 'macro-banana-protein-minimum-per-serving',
  type: 'nutrition-filter',
  query: 'банан белка не менее 3 г на порцию',
  relevantIds: annotations
    .filter(({ recipe, ingredients }) => ingredients.has(bananaTerm)
      && recipe.nutrition?.perServing?.protein !== null && recipe.nutrition?.perServing?.protein >= 3)
    .map(({ recipe }) => recipe.id),
  labelMethod: 'точный ингредиент «банан» и естественно сформулированное ограничение белка на порцию: не менее 3 г',
};
const noMatch = {
  id: 'no-match-fictional-ingredient',
  type: 'no-match',
  query: 'киберкрокодильный фламбедир',
  relevantIds: [],
  labelMethod: 'токены отсутствуют в корпусе; ожидается пустая выдача',
};
const noMatchTokens = tokenize(noMatch.query);
if (noMatchTokens.some((queryToken) => annotations.some((entry) => entry.allText.has(queryToken)))) {
  throw new Error('The no-match query unexpectedly overlaps the corpus.');
}

for (const item of [...ingredientCases, ...tagCases, bananaUnder30, bananaWithoutSugar, timeOnly, macroFilter, perServingMacroFilter]) {
  if (item.relevantIds.length === 0) throw new Error('Benchmark case has no gold labels: ' + item.id);
}

const benchmark = {
  version: 1,
  corpus: 'd0rj/povarenok_recipes_detail filtered to dessert candidates',
  note: 'Pilot benchmark. Title and alias cases are manually targeted; ingredient, tag, time and nutrition cases use the explicit field criteria recorded per case. It evaluates retrieval/filtering, not recipe correctness.',
  createdAt: new Date().toISOString(),
  queries: [
    ...manualTitleCases,
    aliasCase,
    ...ingredientCases,
    ...tagCases,
    bananaUnder30,
    bananaWithoutSugar,
    timeOnly,
    macroFilter,
    perServingMacroFilter,
    noMatch,
  ],
};
await writeFile(benchmarkPath, JSON.stringify(benchmark, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  queries: benchmark.queries.length,
  byType: Object.fromEntries([...new Set(benchmark.queries.map((item) => item.type))].map((type) => [
    type,
    benchmark.queries.filter((item) => item.type === type).length,
  ])),
  goldCounts: benchmark.queries.map(({ id, relevantIds }) => ({ id, relevant: relevantIds.length })),
  outputPath: benchmarkPath,
}, null, 2));
