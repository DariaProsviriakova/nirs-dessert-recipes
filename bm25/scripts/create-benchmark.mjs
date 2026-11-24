import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize } from '../src/text.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const corpusPath = path.resolve(moduleDir, '../data/generated/dessert-corpus.jsonl');
const benchmarkPath = path.resolve(moduleDir, '../data/benchmark.json');
const manualPath = path.resolve(moduleDir, '../data/manual-benchmark-queries.json');
const corpusText = await readFile(corpusPath, 'utf8');
const recipes = corpusText.split(/\r?\n/u).filter(Boolean).map((line) => JSON.parse(line));
const manualSource = JSON.parse((await readFile(manualPath, 'utf8')).replace(/^\uFEFF/u, ''));
const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
const token = (value) => tokenize(value)[0];
const annotations = recipes.map((recipe) => ({
  recipe,
  ingredients: new Set((recipe.ingredientNames ?? []).flatMap(tokenize)),
  tags: new Set((recipe.tags ?? []).flatMap(tokenize)),

}));

function requireRecipe(id) {
  const recipe = byId.get(id);
  if (!recipe) throw new Error('Benchmark target is missing from the corpus: ' + id);
  return recipe;
}

const manualQueries = manualSource.queries.map((item) => {
  if (!item.id || !item.query || !Array.isArray(item.relevantIds) || !Array.isArray(item.reviewedCandidateIds)) {
    throw new Error('Manual benchmark query must have an id, query, relevantIds and reviewedCandidateIds.');
  }
  const duplicateLabels = item.relevantIds.filter((id, index, values) => values.indexOf(id) !== index);
  if (duplicateLabels.length) throw new Error('Duplicate relevant ID in manual query: ' + item.id);
  for (const id of [...item.relevantIds, ...item.reviewedCandidateIds]) requireRecipe(id);
  const reviewed = new Set(item.reviewedCandidateIds);
  for (const id of item.relevantIds) {
    if (!reviewed.has(id)) throw new Error('Relevant ID is missing from the manually reviewed pool: ' + item.id + ' / ' + id);
  }
  return {
    ...item,
    labelSource: 'manual',
    labelMethod: 'manual review: ' + item.judgmentNote,
  };
});

const aliasCase = manualQueries.find((item) => item.id === 'alias-apple-sponge-pie');
if (aliasCase) {
  for (const id of aliasCase.relevantIds) {
    if (!(requireRecipe(id).aliases ?? []).includes(aliasCase.query)) {
      throw new Error('The configured manual alias is missing. Run npm run corpus after updating manual-aliases.json.');
    }
  }
}

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
    .map((entry) => entry.recipe.id),
  labelMethod: 'точное совпадение ингредиента «банан» без ингредиента со stem «сахар»',
};
const timeOnly = {
  id: 'time-only-under-20',
  type: 'time-filter',
  query: 'мне нужен рецепт до 20 минут',
  relevantIds: annotations
    .filter(({ recipe }) => recipe.timeMinutes !== null && !recipe.timeAnomaly && recipe.timeMinutes <= 20)
    .map((entry) => entry.recipe.id),
  labelMethod: 'все записи с доступным временем <= 20 минут; выдача без текстового терма сортируется по времени',
};
const macroFilter = {
  id: 'macro-banana-under-200-kcal',
  type: 'nutrition-filter',
  query: 'банан до 200 ккал на 100 г',
  relevantIds: annotations
    .filter(({ recipe, ingredients }) => ingredients.has(bananaTerm)
      && recipe.nutrition?.per100g?.kcal !== null && recipe.nutrition?.per100g?.kcal <= 200)
    .map((entry) => entry.recipe.id),
  labelMethod: 'точный ингредиент «банан» и ограничение КБЖУ на 100 г: ккал <= 200',
};
const perServingMacroFilter = {
  id: 'macro-banana-protein-minimum-per-serving',
  type: 'nutrition-filter',
  query: 'банан белка не менее 3 г на порцию',
  relevantIds: annotations
    .filter(({ recipe, ingredients }) => ingredients.has(bananaTerm)
      && recipe.nutrition?.perServing?.protein !== null && recipe.nutrition?.perServing?.protein >= 3)
    .map((entry) => entry.recipe.id),
  labelMethod: 'точный ингредиент «банан» и ограничение белка на порцию: не менее 3 г',
};
const noMatch = {
  id: 'no-match-fictional-ingredient',
  type: 'no-match',
  query: 'киберкрокодильный фламбедир',
  relevantIds: [],
  labelMethod: 'контрольный искусственный запрос: токены отсутствуют в корпусе; ожидается пустая выдача',
};
const noMatchTokens = tokenize(noMatch.query);
const normalizedCorpusText = corpusText.toLocaleLowerCase('ru');
if (noMatchTokens.some((queryToken) => normalizedCorpusText.includes(queryToken))) {
  throw new Error('The no-match query unexpectedly overlaps the corpus.');
}

const fieldDerivedCases = [
  ...ingredientCases,
  ...tagCases,
  bananaUnder30,
  bananaWithoutSugar,
  timeOnly,
  macroFilter,
  perServingMacroFilter,
  noMatch,
];
for (const item of fieldDerivedCases) {
  if (item.relevantIds.length === 0 && item.type !== 'no-match') {
    throw new Error('Field-derived benchmark case has no gold labels: ' + item.id);
  }
  item.labelSource = 'field-derived';
}
const queries = [...manualQueries, ...fieldDerivedCases];
const benchmark = {
  version: 2,
  corpus: 'd0rj/povarenok_recipes_detail filtered to dessert candidates',
  note: 'Manual natural-language queries use reviewed relevance labels. Field-derived cases remain separate checks for exact field criteria and filters; their scores are not interchangeable.',
  createdAt: new Date().toISOString(),
  queries,
};
await writeFile(benchmarkPath, JSON.stringify(benchmark, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  queries: benchmark.queries.length,
  byLabelSource: Object.fromEntries([...new Set(queries.map((item) => item.labelSource))].map((source) => [
    source,
    queries.filter((item) => item.labelSource === source).length,
  ])),
  byType: Object.fromEntries([...new Set(queries.map((item) => item.type))].map((type) => [
    type,
    queries.filter((item) => item.type === type).length,
  ])),
  manualQueries: manualQueries.map(({ id, relevanceScope, relevantIds }) => ({ id, relevanceScope, relevant: relevantIds.length })),
  outputPath: benchmarkPath,
}, null, 2));
