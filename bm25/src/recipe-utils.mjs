const minutePattern = /^(\d+)\s*(?:минут(?:а|ы|у)?|мин\.?)$/iu;
const hourMinutePattern = /^(?:(\d+)\s*(?:час(?:а|ов)?|ч\.?)\s*)?(?:(\d+)\s*(?:минут(?:а|ы|у)?|мин\.?)\s*)?$/iu;

export function parseTimeMinutes(raw) {
  const text = String(raw ?? '').trim().replace(/ё/giu, 'е');
  if (!text) return null;
  const direct = text.match(minutePattern);
  if (direct) return Number(direct[1]);
  const parts = text.match(hourMinutePattern);
  if (!parts || (!parts[1] && !parts[2])) return null;
  const total = Number(parts[1] ?? 0) * 60 + Number(parts[2] ?? 0);
  return Number.isFinite(total) && total > 0 ? total : null;
}

export function parsePositiveInteger(raw, max = Number.MAX_SAFE_INTEGER) {
  const text = String(raw ?? '').trim();
  if (!/^\d+$/u.test(text)) return null;
  const number = Number(text);
  return Number.isSafeInteger(number) && number > 0 && number <= max ? number : null;
}

function macroNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function macroSet(value) {
  if (!value || typeof value !== 'object') return null;
  const set = {
    carbs: macroNumber(value.carb ?? value.carbs),
    fats: macroNumber(value.fats ?? value.fat),
    kcal: macroNumber(value.kcal ?? value.calories),
    protein: macroNumber(value.protein),
  };
  return Object.values(set).some((item) => item !== null) ? set : null;
}

export function normalizeNutrition(raw) {
  if (!raw || typeof raw !== 'object') {
    return { per100g: null, wholeDish: null, perServing: null };
  }
  return {
    per100g: macroSet(raw['100 г блюда'] ?? raw.per100g ?? raw.per_100g),
    wholeDish: macroSet(raw['Готового блюда'] ?? raw.wholeDish ?? raw.whole_dish),
    perServing: macroSet(raw['Порции'] ?? raw.perServing ?? raw.per_serving),
  };
}
