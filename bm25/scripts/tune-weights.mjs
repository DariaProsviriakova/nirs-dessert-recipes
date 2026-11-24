import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchRecipes } from '../src/bm25.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(moduleDir, '../data/generated/bm25-index.json.gz');
const benchmarkPath = path.resolve(moduleDir, '../data/benchmark.json');
const resultsDir = path.resolve(moduleDir, '../data/benchmark-results');
const outputPath = path.join(resultsDir, 'weight-sweep.json');
const cutoff = 5;
const maxK = 10;
const index = JSON.parse(gunzipSync(await readFile(indexPath), { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));
const baseline = index.scoring.fieldBoosts;

const configurations = [
  { name: 'selected-balanced-mid', fieldBoosts: baseline },
  {
    name: 'original-default',
    fieldBoosts: { title: 3.5, aliases: 2.5, ingredientNames: 2.2, categories: 1.4, tags: 1.6, tastes: 1.1, purposes: 0.7, description: 1.0, steps: 0.25 },
  },
  {
    name: 'ingredient-tag-focus',
    fieldBoosts: {
      title: 3.5, aliases: 2.5, ingredientNames: 5.0, categories: 1.2,
      tags: 4.5, tastes: 1.0, purposes: 0.6, description: 0.75, steps: 0.1,
    },
  },
  {
    name: 'tag-balanced-plus',
    fieldBoosts: {
      title: 3.5, aliases: 2.5, ingredientNames: 4.0, categories: 1.4,
      tags: 3.0, tastes: 1.2, purposes: 0.8, description: 1.0, steps: 0.2,
    },
  },
  {
    name: 'text-heavy',
    fieldBoosts: {
      title: 5.0, aliases: 3.0, ingredientNames: 2.5, categories: 1.5,
      tags: 2.0, tastes: 1.0, purposes: 0.7, description: 1.5, steps: 0.5,
    },
  },
];

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function summarize(items) {
  const positive = items.filter((item) => item.relevantCount > 0);
  const noMatch = items.filter((item) => item.relevantCount === 0);
  return {
    queries: items.length,
    queryCount: items.length,
    macroRecallAt5: mean(positive.map((item) => item.recallAt5)),
    mrrAt10: mean(positive.map((item) => item.reciprocalRankAt10)),
    noMatchAccuracy: mean(noMatch.map((item) => item.noMatchCorrect)),
  };
}

function scoreConfiguration(configuration) {
  index.scoring = { ...index.scoring, fieldBoosts: configuration.fieldBoosts };
  const cases = benchmark.queries.map((item) => {
    const results = searchRecipes(index, item.query, { limit: maxK, filters: item.filters });
    const relevant = new Set(item.relevantIds);
    const foundAtCutoff = results.slice(0, cutoff).filter(({ recipe }) => relevant.has(recipe.id)).length;
    const firstRelevant = results.findIndex(({ recipe }) => relevant.has(recipe.id));
    return {
      type: item.type,
      labelSource: item.labelSource ?? 'unspecified',
      relevantCount: relevant.size,
      recallAt5: relevant.size ? foundAtCutoff / relevant.size : null,
      reciprocalRankAt10: relevant.size ? (firstRelevant < 0 ? 0 : 1 / (firstRelevant + 1)) : null,
      noMatchCorrect: relevant.size === 0 ? Number(results.length === 0) : null,
    };
  });
  const byLabelSource = {};
  for (const source of [...new Set(cases.map((item) => item.labelSource))]) {
    byLabelSource[source] = summarize(cases.filter((item) => item.labelSource === source));
  }
  const byType = {};
  for (const type of [...new Set(cases.map((item) => item.type))]) {
    byType[type] = summarize(cases.filter((item) => item.type === type));
  }
  const overall = summarize(cases);
  return {
    name: configuration.name,
    macroRecallAt5: overall.macroRecallAt5,
    mrrAt10: overall.mrrAt10,
    noMatchAccuracy: overall.noMatchAccuracy,
    manualQueryCount: byLabelSource.manual?.queryCount ?? 0,
    manualMacroRecallAt5: byLabelSource.manual?.macroRecallAt5 ?? null,
    manualMrrAt10: byLabelSource.manual?.mrrAt10 ?? null,
    byLabelSource,
    byType,
  };
}

const results = configurations.map(scoreConfiguration);
const output = {
  corpusDocumentCount: index.documentCount,
  benchmarkQueryCount: benchmark.queries.length,
  tuningBasis: 'Manual natural-language queries drive comparisons; field-derived criteria remain a separate diagnostic.',
  relevanceLabels: 'same fixed data/benchmark.json for every configuration',
  results,
  generatedAt: new Date().toISOString(),
};
await mkdir(resultsDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ tuningBasis: output.tuningBasis, results, outputPath }, null, 2));
