import { tokenize } from './text.mjs';

const operatorExpression = '(не\\s+менее|не\\s+более|не\\s+больше|не\\s+меньше|максимум|минимум|меньше|менее|больше|от|до|<=|>=|≤|≥)';
const macroExpression = '(бел(?:ок|ка|ков)|протеин(?:а)?|жир(?:а|ов)?|углевод(?:а|ов)?)';
const unitExpression = '(ккал|калори(?:я|и|й)?|г(?:р\\.?)?)';
const basisExpression = '(100\\s*г|(?:\\d+\\s*)?порци[юя])';
const macroPrefixPattern = new RegExp(
  '(?<![\\p{L}\\p{N}])' + operatorExpression + '\\s*(\\d+(?:[.,]\\d+)?)\\s*'
    + unitExpression + '\\s*' + macroExpression + '?\\s*на\\s*' + basisExpression,
  'giu',
);
const macroSuffixPattern = new RegExp(
  '(?<![\\p{L}\\p{N}])' + macroExpression + '\\s+' + operatorExpression
    + '\\s*(\\d+(?:[.,]\\d+)?)\\s*г\\s*на\\s*' + basisExpression,
  'giu',
);
const macroMentionPattern = /(?<![\p{L}\p{N}])(?:ккал|калори[яий]|белк|протеин|жир|углевод)(?![\p{L}\p{N}])/iu;
const timePattern = /(?<![\p{L}\p{N}])(?:до|не\s+более|не\s+дольше|максимум|меньше|менее|за|<=|≤)\s*(\d+(?:[.,]\d+)?)\s*(минут(?:а|ы|у)?|мин\.?|час(?:а|ов)?|ч\.?)/giu;
const exclusionPattern = /(?<![\p{L}\p{N}])(?:без|кроме|не\s+(?:хочу|добавляй|предлагай|нужно)|убери|исключи)\s+([\p{L}\p{N}-]+(?:\s+(?:и\s+)?[\p{L}\p{N}-]+)?)(?![\p{L}\p{N}])/giu;

function timeToMinutes(amountText, unitText) {
  const amount = Number(amountText.replace(',', '.'));
  const unit = unitText.toLocaleLowerCase('ru-RU');
  return /^(?:ч\.?|час)/u.test(unit) ? amount * 60 : amount;
}

function macroName(unitText, macroText) {
  const unit = unitText.toLocaleLowerCase('ru-RU');
  const label = String(macroText ?? '').toLocaleLowerCase('ru-RU');
  if (/ккал|калори/u.test(unit)) return 'kcal';
  if (/бел|протеин/u.test(label)) return 'protein';
  if (/жир/u.test(label)) return 'fats';
  if (/углевод/u.test(label)) return 'carbs';
  return null;
}

function macroBasis(value) {
  return /^100/u.test(value.replace(/\s+/g, '')) ? 'per100g' : 'perServing';
}

function macroBound(operator) {
  return /не\s+менее|минимум|больше|^от$|>=|≥/iu.test(operator) ? 'min' : 'max';
}

export function parseQuery(query) {
  let searchText = String(query ?? '');
  const filters = {};
  const exclusions = [];
  let clarificationRequired = null;

  function addMacro(operator, amountText, unitText, macroText, basisText) {
    const macro = macroName(unitText, macroText);
    const basis = macroBasis(basisText);
    const amount = Number(amountText.replace(',', '.'));
    if (!macro || !Number.isFinite(amount)) return;
    if (filters.nutritionBasis && filters.nutritionBasis !== basis) {
      clarificationRequired = 'multipleNutritionBases';
      return;
    }
    filters.nutritionBasis = basis;
    filters.nutrition ??= {};
    filters.nutrition[macro] ??= {};
    filters.nutrition[macro][macroBound(operator)] = amount;
  }

  searchText = searchText.replace(macroSuffixPattern, (_match, macro, operator, amount, basis) => {
    addMacro(operator, amount, 'г', macro, basis);
    return ' ';
  });
  searchText = searchText.replace(macroPrefixPattern, (_match, operator, amount, unit, macro, basis) => {
    addMacro(operator, amount, unit, macro, basis);
    return ' ';
  });

  const numericMacroRemains = /(?<![\p{L}\p{N}])(?:ккал|калори[яий]|белк|протеин|жир|углевод)(?![\p{L}\p{N}])/iu.test(searchText)
    && /\d/u.test(searchText);
  if (numericMacroRemains) clarificationRequired ??= 'nutritionBasis';

  searchText = searchText.replace(timePattern, (_match, amount, unit) => {
    const limit = timeToMinutes(amount, unit);
    if (Number.isFinite(limit)) filters.maxTimeMinutes = Math.min(filters.maxTimeMinutes ?? Infinity, limit);
    return ' ';
  });

  searchText = searchText.replace(exclusionPattern, (_match, phrase) => {
    const terms = tokenize(phrase);
    if (terms.length) exclusions.push([...new Set(terms)]);
    return ' ';
  });

  return {
    searchText: searchText.replace(/\s+/g, ' ').trim(),
    filters,
    exclusions,
    clarificationRequired,
    queryTokens: [...new Set(tokenize(searchText))],
  };
}
