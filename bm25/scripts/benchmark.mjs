import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchRecipes } from '../src/bm25.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.resolve(moduleDir, '../data/generated/bm25-index.json.gz');
const benchmarkPath = path.resolve(moduleDir, '../data/benchmark.json');
const resultsDir = path.resolve(moduleDir, '../data/benchmark-results');
const outputPath = path.join(resultsDir, 'metrics.json');
const cutoffValues = [1, 3, 5, 10];
const maxK = Math.max(...cutoffValues);
const index = JSON.parse(gunzipSync(await readFile(indexPath), { maxOutputLength: 1024 * 1024 * 1024 }).toString('utf8'));
const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));

function evaluateCase(item) {
  const results = searchRecipes(index, item.query, { limit: maxK, filters: item.filters });
  const relevant = new Set(item.relevantIds);
  const rankedRelevant = results.findIndex(({ recipe }) => relevant.has(recipe.id));
  const reviewed = new Set(item.reviewedCandidateIds ?? []);
  const metrics = {};
  for (const k of cutoffValues) {
    const top = results.slice(0, k);
    const found = top.filter(({ recipe }) => relevant.has(recipe.id)).length;
    metrics['recallAt' + k] = relevant.size ? found / relevant.size : null;
    metrics['hitAt' + k] = relevant.size ? Number(found > 0) : null;
  }
  metrics.reciprocalRankAt10 = relevant.size && rankedRelevant >= 0 ? 1 / (rankedRelevant + 1) : relevant.size ? 0 : null;
  metrics.noMatchCorrect = relevant.size === 0 ? Number(results.length === 0) : null;
  return {
    id: item.id,
    type: item.type,
    labelSource: item.labelSource ?? 'unspecified',
    relevanceScope: item.relevanceScope ?? null,
    query: item.query,
    relevantCount: relevant.size,
    reviewedCandidateCount: item.reviewedCandidateIds?.length ?? null,
    reviewedTop10Count: item.reviewedCandidateIds
      ? results.slice(0, 10).filter(({ recipe }) => reviewed.has(recipe.id)).length
      : null,
    returnedIds: results.map(({ recipe }) => recipe.id),
    topTitles: results.slice(0, 5).map(({ recipe }) => recipe.title),
    metrics,
  };
}

function mean(values) {
  const selected = values.filter((value) => value !== null && Number.isFinite(value));
  return selected.length ? selected.reduce((sum, value) => sum + value, 0) / selected.length : null;
}

function summarize(items) {
  const positive = items.filter((item) => item.relevantCount > 0);
  const noMatch = items.filter((item) => item.relevantCount === 0);
  return {
    queries: items.length,
    queryCount: items.length,
    positiveQueryCount: positive.length,
    macroRecallAt1: mean(positive.map((item) => item.metrics.recallAt1)),
    macroRecallAt3: mean(positive.map((item) => item.metrics.recallAt3)),
    macroRecallAt5: mean(positive.map((item) => item.metrics.recallAt5)),
    macroRecallAt10: mean(positive.map((item) => item.metrics.recallAt10)),
    mrrAt10: mean(positive.map((item) => item.metrics.reciprocalRankAt10)),
    hitRateAt5: mean(positive.map((item) => item.metrics.hitAt5)),
    noMatchAccuracy: mean(noMatch.map((item) => item.metrics.noMatchCorrect)),
    noMatchQueries: noMatch.length,
  };
}

const perQuery = benchmark.queries.map(evaluateCase);
const byType = {};
for (const type of [...new Set(perQuery.map((item) => item.type))]) {
  byType[type] = summarize(perQuery.filter((item) => item.type === type));
}
const byLabelSource = {};
for (const source of [...new Set(perQuery.map((item) => item.labelSource))]) {
  byLabelSource[source] = summarize(perQuery.filter((item) => item.labelSource === source));
}
const result = {
  benchmarkVersion: benchmark.version,
  indexVersion: index.version,
  algorithm: index.algorithm,
  corpusDocumentCount: index.documentCount,
  queryCount: perQuery.length,
  summary: summarize(perQuery),
  byLabelSource,
  byType,
  perQuery,
  generatedAt: new Date().toISOString(),
};
await mkdir(resultsDir, { recursive: true });
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({
  summary: result.summary,
  byLabelSource: result.byLabelSource,
  outputPath,
}, null, 2));
