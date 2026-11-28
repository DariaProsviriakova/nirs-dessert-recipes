import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildBm25Index, searchRecipes } from '../src/bm25.mjs';
import { makeSearch } from '../../backend/search.mjs';
import { converse } from '../../backend/dialogue.mjs';
import { config } from '../../backend/config.mjs';
import { makeLLM } from '../../backend/llm.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(moduleDir, '../data');
const benchmarkPath = path.join(dataDir, 'course-benchmark.json');
const outputPath = path.join(dataDir, 'course-benchmark-results.json');
const withLLM = process.argv.slice(2).includes('--with-llm');
const unexpectedArgs = process.argv.slice(2).filter((arg) => arg !== '--with-llm');
if (unexpectedArgs.length) throw new Error('Неизвестный аргумент: ' + unexpectedArgs.join(' '));

const benchmark = JSON.parse(await readFile(benchmarkPath, 'utf8'));
const index = buildBm25Index(benchmark.documents);
const search = makeSearch(index);
let llm = {};
let llmProvider = 'none';
if (withLLM) {
  const settings = config();
  const service = makeLLM(settings);
  if (!service.configured) {
    throw new Error('LLM не настроена. Проверьте LLM_PROVIDER и LLM_API_KEY в корневом .env.');
  }
  llmProvider = settings.llmProvider;
  // Only positive turns call reply. No intent interpreter is exposed, and the
  // dialogue skips reply for an empty result, so trap documents never go to LLM.
  llm = { reply: service.reply.bind(service) };
}

const mean = (values) => values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : null;
const perQuery = [];
for (const question of benchmark.questions) {
  const gold = new Set(question.goldDocIds);
  const ranked = searchRecipes(index, question.query, { limit: 10 });
  const dialogue = await converse({ query: question.query, context: {}, history: [], search, llm });
  const displayedIds = dialogue.recipes.map((recipe) => recipe.id);
  const retrievedIds = ranked.map(({ recipe }) => recipe.id);
  const hitRank = retrievedIds.findIndex((id) => gold.has(id));
  const retrieved = ranked.map(({ recipe, score }) => ({
    id: recipe.id,
    sourceId: recipe.sourceId,
    title: recipe.title,
    sourceUrl: recipe.sourceUrl,
    score: Number(score.toFixed(4)),
  }));
  if (question.type === 'answerable') {
    const foundAt5 = retrievedIds.slice(0, 5).filter((id) => gold.has(id)).length;
    const answerCorrect = displayedIds.length > 0 &&
      displayedIds.every((id) => gold.has(id)) && Boolean(dialogue.answer?.trim());
    perQuery.push({
      id: question.id,
      type: question.type,
      query: question.query,
      goldDocIds: question.goldDocIds,
      retrieved,
      answer: dialogue.answer,
      answerCards: dialogue.recipes.map((recipe) => ({ id: recipe.id, title: recipe.title, sourceUrl: recipe.sourceUrl })),
      llmStatus: dialogue.llmStatus,
      metrics: {
        recallAt5: question.goldDocIds.length ? foundAt5 / question.goldDocIds.length : null,
        reciprocalRankAt10: hitRank >= 0 ? 1 / (hitRank + 1) : 0,
        answerCorrect,
      },
    });
  } else {
    const rejected = displayedIds.length === 0 &&
      ['empty', 'clarification'].includes(dialogue.status) && Boolean(dialogue.answer?.trim());
    perQuery.push({
      id: question.id,
      type: question.type,
      query: question.query,
      goldDocIds: [],
      retrieved,
      answer: dialogue.answer,
      answerCards: [],
      llmStatus: dialogue.llmStatus,
      metrics: { correctRejection: rejected },
    });
  }
}

const positive = perQuery.filter((item) => item.type === 'answerable');
const traps = perQuery.filter((item) => item.type === 'trap');
const result = {
  benchmarkVersion: benchmark.version,
  benchmarkTitle: benchmark.title,
  corpusDocumentCount: benchmark.documents.length,
  queryCount: perQuery.length,
  llmRequested: withLLM,
  llmProvider,
  metricNotes: {
    answerAccuracy: 'Доля обычных вопросов, где есть хотя бы одна карточка и все показанные карточки входят в gold-набор. Это точность рекомендаций; свободный текст отдельно требует ручной проверки.',
    correctRejectionRate: 'Доля ловушек без карточек и с непустым отказом или уточнением.',
    retrieval: 'BM25 ранжирует запрос по фиксированному набору из 30 документов; в отчёте сохраняется top-10.',
  },
  summary: {
    corpusDocuments: benchmark.documents.length,
    answerableQuestions: positive.length,
    trapQuestions: traps.length,
    recallAt5: mean(positive.map((item) => item.metrics.recallAt5)),
    mrrAt10: mean(positive.map((item) => item.metrics.reciprocalRankAt10)),
    answerAccuracy: mean(positive.map((item) => Number(item.metrics.answerCorrect))),
    correctRejectionRate: mean(traps.map((item) => Number(item.metrics.correctRejection))),
    correctAnswers: positive.filter((item) => item.metrics.answerCorrect).length,
    correctRejections: traps.filter((item) => item.metrics.correctRejection).length,
  },
  perQuery,
  generatedAt: new Date().toISOString(),
};
await writeFile(outputPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ summary: result.summary, llmRequested: withLLM, outputPath }, null, 2));
