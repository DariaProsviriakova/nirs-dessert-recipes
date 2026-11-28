import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDessert } from '../../backend/catalog.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(moduleDir, '../data');
const sourcePath = path.join(dataDir, 'generated/dessert-corpus.jsonl');
const outputPath = path.join(dataDir, 'course-benchmark.json');
const sourceIds = [
  'povarenok-100077', 'povarenok-100149', 'povarenok-100414',
  'povarenok-100005', 'povarenok-100024', 'povarenok-100033',
  'povarenok-100013', 'povarenok-10002', 'povarenok-100028',
  'povarenok-100076', 'povarenok-100111', 'povarenok-100114',
  'povarenok-100035', 'povarenok-100153', 'povarenok-100387',
  'povarenok-100674', 'povarenok-100864', 'povarenok-101698',
  'povarenok-100072', 'povarenok-100116', 'povarenok-100372',
  'povarenok-100043', 'povarenok-100085', 'povarenok-100098',
  'povarenok-100216', 'povarenok-100409', 'povarenok-100412',
  'povarenok-100070', 'povarenok-100078', 'povarenok-100115',
];
const questions = [
  { id: 'Q01', type: 'answerable', query: 'Хочу десерт с бананом', ingredient: 'банан', goldDocIds: ['D01', 'D02', 'D03'] },
  { id: 'Q02', type: 'answerable', query: 'Найди что-нибудь с шоколадом', ingredient: 'шоколад', goldDocIds: ['D03', 'D04', 'D05', 'D06', 'D14', 'D28', 'D30'] },
  { id: 'Q03', type: 'answerable', query: 'Подбери сладкое с яблоком', ingredient: 'яблоко', goldDocIds: ['D07', 'D08', 'D09', 'D20'] },
  { id: 'Q04', type: 'answerable', query: 'Хочу десерт с творогом', ingredient: 'творог', goldDocIds: ['D09', 'D10', 'D11', 'D12', 'D14', 'D18'] },
  { id: 'Q05', type: 'answerable', query: 'Подбери десерт с малиной', ingredient: 'малина', goldDocIds: ['D13', 'D14', 'D15'] },
  { id: 'Q06', type: 'answerable', query: 'Подбери что-нибудь с тыквой', ingredient: 'тыква', goldDocIds: ['D02', 'D16', 'D17', 'D18'] },
  { id: 'Q07', type: 'answerable', query: 'Хочу что-нибудь с морковью', ingredient: 'морковь', goldDocIds: ['D19', 'D20', 'D21'] },
  { id: 'Q08', type: 'answerable', query: 'Найди десерт с лимоном', ingredient: 'лимон', goldDocIds: ['D02', 'D05', 'D07', 'D13', 'D15', 'D22', 'D23', 'D24'] },
  { id: 'Q09', type: 'answerable', query: 'Подбери десерт с апельсином', ingredient: 'апельсин', goldDocIds: ['D07', 'D08', 'D10', 'D18', 'D21', 'D25', 'D26', 'D27'] },
  { id: 'Q10', type: 'answerable', query: 'Хочу десерт с орехами', ingredient: 'орехи', goldDocIds: ['D02', 'D03', 'D04', 'D08', 'D12', 'D16', 'D19', 'D21', 'D25', 'D26', 'D28', 'D29', 'D30'] },
  { id: 'Q11', type: 'trap', query: 'Как приготовить куриный суп?', goldDocIds: [], expected: 'refusal' },
  { id: 'Q12', type: 'trap', query: 'Найди торт из лунной пыли и марсианского песка.', goldDocIds: [], expected: 'refusal' },
  { id: 'Q13', type: 'trap', query: 'Киберкрокодильный фламбедир.', goldDocIds: [], expected: 'refusal' },
  { id: 'Q14', type: 'trap', query: 'Подбери пирог из звездной пыли.', goldDocIds: [], expected: 'refusal' },
  { id: 'Q15', type: 'trap', query: 'Подбери печенье из метеоритной крошки и облачной ваты.', goldDocIds: [], expected: 'refusal' },
];

const lines = (await readFile(sourcePath, 'utf8')).split(/\r?\n/u).filter(Boolean);
const source = new Map(lines.map((line) => {
  const recipe = JSON.parse(line);
  return [recipe.id, recipe];
}));
const fields = [
  'sourceUrl', 'imageUrl', 'title', 'description', 'categories', 'rootCategory',
  'ingredients', 'ingredientNames', 'steps', 'tags', 'tastes', 'purposes',
  'timeRaw', 'timeMinutes', 'timeAnomaly', 'servingsRaw', 'servings',
  'servingsAnomaly', 'nutrition', 'aliases',
];
const documents = sourceIds.map((sourceId, index) => {
  const recipe = source.get(sourceId);
  if (!recipe) throw new Error('В локальном корпусе не найден ' + sourceId);
  if (!isDessert(recipe)) throw new Error('Рецепт не прошёл фильтр десертов: ' + sourceId);
  const document = { id: 'D' + String(index + 1).padStart(2, '0'), sourceId };
  for (const field of fields) document[field] = recipe[field] ?? null;
  return document;
});
const documentIds = new Set(documents.map((document) => document.id));
for (const question of questions) {
  if (question.type === 'answerable' && question.goldDocIds.length < 3) {
    throw new Error(question.id + ': нужно минимум три релевантных документа');
  }
  for (const id of question.goldDocIds) {
    if (!documentIds.has(id)) throw new Error(question.id + ': неизвестный ID ' + id);
  }
}
if (documents.length !== 30 || questions.length !== 15 ||
    questions.filter((question) => question.type === 'answerable').length !== 10 ||
    questions.filter((question) => question.type === 'trap').length !== 5) {
  throw new Error('Ожидаются 30 документов, 10 вопросов с ответом и 5 ловушек.');
}
const benchmark = {
  version: 1,
  title: 'Учебный benchmark RAG/BM25 — занятие 3',
  source: 'd0rj/povarenok_recipes_detail; исходный ID сохранён в поле sourceId каждой записи.',
  corpusRule: 'Фиксированный срез из 30 карточек; ID D01–D30 используются в задании.',
  relevanceRule: 'Для вопроса с ингредиентом релевантна карточка, где ингредиент прямо указан в составе; goldDocIds размечены для фиксированного среза.',
  documents,
  questions,
};
await writeFile(outputPath, JSON.stringify(benchmark, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ documents: documents.length, answerable: 10, traps: 5, outputPath }, null, 2));
