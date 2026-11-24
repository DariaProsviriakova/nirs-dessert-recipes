import { phraseKey, tokenize } from './text.mjs';
import { parseQuery } from './query.mjs';

export const INDEX_VERSION = 1;
export const DEFAULT_SCORING = {
  k1: 1.5,
  b: 0.75,
  fieldBoosts: {
    title: 3.5,
    aliases: 2.5,
    ingredientNames: 3.5,
    categories: 1.2,
    tags: 3.5,
    tastes: 1.0,
    purposes: 0.6,
    description: 0.75,
    steps: 0.1,
  },
  phraseBoosts: {
    exactTitle: 12,
    titleContains: 4,
    exactAlias: 60,
    aliasContains: 10,
  },
};

function fieldValues(recipe) {
  return {
    title: [recipe.title],
    aliases: recipe.aliases ?? [],
    ingredientNames: recipe.ingredientNames ?? [],
    categories: recipe.categories ?? [],
    tags: recipe.tags ?? [],
    tastes: recipe.tastes ?? [],
    purposes: recipe.purposes ?? [],
    description: [recipe.description],
    steps: recipe.steps ?? [],
  };
}

export function buildBm25Index(recipes, scoring = DEFAULT_SCORING) {
  const documents = [];
  const termPostings = new Map();
  const totalLengths = Object.fromEntries(Object.keys(scoring.fieldBoosts).map((field) => [field, 0]));

  for (const recipe of recipes) {
    const values = fieldValues(recipe);
    const lengths = {};
    const perTerm = new Map();

    for (const field of Object.keys(scoring.fieldBoosts)) {
      const tokens = values[field].flatMap((value) => tokenize(value));
      lengths[field] = tokens.length;
      totalLengths[field] += tokens.length;
      for (const token of tokens) {
        if (!perTerm.has(token)) perTerm.set(token, {});
        const frequencies = perTerm.get(token);
        frequencies[field] = (frequencies[field] ?? 0) + 1;
      }
    }

    const documentIndex = documents.length;
    documents.push({ recipe, lengths });
    for (const [term, frequencies] of perTerm) {
      if (!termPostings.has(term)) termPostings.set(term, []);
      termPostings.get(term).push([documentIndex, frequencies]);
    }
  }

  const averageLengths = Object.fromEntries(
    Object.entries(totalLengths).map(([field, total]) => [
      field,
      documents.length ? total / documents.length : 0,
    ]),
  );
  const terms = Object.fromEntries(
    [...termPostings.entries()].map(([term, postings]) => [term, postings]),
  );

  return {
    version: INDEX_VERSION,
    algorithm: 'fielded-bm25',
    builtAt: new Date().toISOString(),
    documentCount: documents.length,
    scoring,
    averageLengths,
    documents,
    terms,
  };
}

function passesNutrition(recipe, filters) {
  const checks = filters.nutrition;
  if (!checks || Object.keys(checks).length === 0) return true;
  const basis = filters.nutritionBasis ?? 'per100g';
  const nutrition = recipe.nutrition?.[basis];
  if (!nutrition) return false;

  for (const [macro, bounds] of Object.entries(checks)) {
    const value = nutrition[macro];
    if (value === null || value === undefined) return false;
    if (bounds.min !== undefined && value < bounds.min) return false;
    if (bounds.max !== undefined && value > bounds.max) return false;
  }
  return true;
}

function passesFilters(recipe, filters) {
  if (filters.maxTimeMinutes !== undefined) {
    if (recipe.timeMinutes === null || recipe.timeAnomaly || recipe.timeMinutes > filters.maxTimeMinutes) return false;
  }
  if (filters.minTimeMinutes !== undefined) {
    if (recipe.timeMinutes === null || recipe.timeAnomaly || recipe.timeMinutes < filters.minTimeMinutes) return false;
  }
  if (filters.minServings !== undefined) {
    if (recipe.servings === null || recipe.servings < filters.minServings) return false;
  }
  if (filters.maxServings !== undefined) {
    if (recipe.servings === null || recipe.servings > filters.maxServings) return false;
  }
  return passesNutrition(recipe, filters);
}

const cookingModeTerms = new Set([
  'выпечк', 'духовк', 'жарен', 'запек', 'варк', 'сыр', 'холод',
]);

function excludedDocumentSet(index, exclusions) {
  const excluded = new Set();
  for (const group of exclusions) {
    const bakingConstraint = group.includes('выпечк');
    if (bakingConstraint) {
      for (let documentIndex = 0; documentIndex < index.documents.length; documentIndex += 1) {
        const recipe = index.documents[documentIndex].recipe;
        const categories = recipe.categories ?? [];
        const hasNoBakeLabel = categories.some((value) => /без\s+выпечк/iu.test(value));
        const rootIsBaking = recipe.rootCategory === 'Выпечка';
        const stepsDescribeBaking = (recipe.steps ?? []).some((value) => /выпека|духовк/iu.test(value));
        if (!hasNoBakeLabel && (rootIsBaking || stepsDescribeBaking)) excluded.add(documentIndex);
      }
    }

    for (const term of group) {
      if (term === 'выпечк' && bakingConstraint) continue;
      const postings = index.terms[term] ?? [];
      for (const [documentIndex, frequencies] of postings) {
        const fields = Object.keys(frequencies);
        const cookingMode = group.some((item) => cookingModeTerms.has(item));
        const relevant = cookingMode
          ? fields.some((field) => ['categories', 'tags', 'description', 'steps'].includes(field))
          : (frequencies.ingredientNames ?? 0) > 0;
        if (relevant) excluded.add(documentIndex);
      }
    }
  }
  return excluded;
}

export function searchRecipes(index, query, options = {}) {
  if (!index || index.version !== INDEX_VERSION) throw new Error('Unsupported BM25 index version.');
  const queryParts = options.parsedQuery
    ?? (Array.isArray(options.queryTokens) ? options : parseQuery(query));
  if (queryParts.clarificationRequired) return [];
  const rawQuery = queryParts.searchText ?? String(query ?? '');
  const queryTokens = queryParts.queryTokens ?? [...new Set(tokenize(rawQuery))];
  const filters = { ...(queryParts.filters ?? {}), ...(options.filters ?? {}) };
  const exclusions = queryParts.exclusions ?? [];
  const limit = Math.max(1, Math.min(100, Number(options.limit ?? 10) || 10));
  const timeOnlyQuery = queryTokens.length === 0 && filters.maxTimeMinutes !== undefined;
  const constrainedOnlyQuery = queryTokens.length === 0
    && (Object.keys(filters).length > 0 || exclusions.length > 0);

  if (queryTokens.length === 0 && !constrainedOnlyQuery) return [];

  const scores = new Float64Array(index.documents.length);
  const candidates = new Set();
  const { k1, b, fieldBoosts } = index.scoring;
  const phraseBoosts = index.scoring.phraseBoosts ?? { exactTitle: 12, titleContains: 4, exactAlias: 60, aliasContains: 10 };
  const normalizedQueryPhrase = phraseKey(rawQuery);

  for (const term of queryTokens) {
    const postings = index.terms[term] ?? [];
    if (postings.length === 0) continue;
    const documentFrequency = postings.length;
    const idf = Math.log(1 + (index.documentCount - documentFrequency + 0.5) / (documentFrequency + 0.5));

    for (const [documentIndex, frequencies] of postings) {
      const document = index.documents[documentIndex];
      let termScore = 0;
      for (const [field, boost] of Object.entries(fieldBoosts)) {
        const frequency = frequencies[field] ?? 0;
        if (frequency === 0) continue;
        const averageLength = index.averageLengths[field] || 1;
        const length = document.lengths[field] ?? 0;
        const denominator = frequency + k1 * (1 - b + b * length / averageLength);
        termScore += boost * frequency * (k1 + 1) / denominator;
      }
      scores[documentIndex] += idf * termScore;
      candidates.add(documentIndex);
    }
  }

  if (constrainedOnlyQuery) {
    for (let i = 0; i < index.documents.length; i += 1) candidates.add(i);
  }

  const excluded = excludedDocumentSet(index, exclusions);
  const results = [];
  for (const documentIndex of candidates) {
    if (excluded.has(documentIndex)) continue;
    const document = index.documents[documentIndex];
    if (!passesFilters(document.recipe, filters)) continue;
    let score = scores[documentIndex];
    if (normalizedQueryPhrase) {
      const title = phraseKey(document.recipe.title);
      const aliases = (document.recipe.aliases ?? []).map(phraseKey);
      if (title === normalizedQueryPhrase) score += phraseBoosts.exactTitle;
      else if (title.includes(normalizedQueryPhrase)) score += phraseBoosts.titleContains;
      if (aliases.includes(normalizedQueryPhrase)) score += phraseBoosts.exactAlias;
      else if (aliases.some((alias) => alias.includes(normalizedQueryPhrase))) score += phraseBoosts.aliasContains;
    }
    if (score === 0 && queryTokens.length > 0) continue;
    results.push({ recipe: document.recipe, score });
  }

  results.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (timeOnlyQuery && left.recipe.timeMinutes !== right.recipe.timeMinutes) {
      return (left.recipe.timeMinutes ?? Infinity) - (right.recipe.timeMinutes ?? Infinity);
    }
    return left.recipe.title.localeCompare(right.recipe.title, 'ru') || left.recipe.id.localeCompare(right.recipe.id);
  });
  return results.slice(0, limit);
}
