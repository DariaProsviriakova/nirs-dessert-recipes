import snowballFactory from 'snowball-stemmers';

const stemmer = snowballFactory.newStemmer('russian');
const stopwords = new Set([
  'и', 'а', 'но', 'или', 'либо', 'да', 'же', 'ли', 'бы', 'то', 'это', 'этот', 'эта', 'эти',
  'мне', 'меня', 'мы', 'я', 'ты', 'вы', 'он', 'она', 'они', 'себя', 'мой', 'моя', 'мои',
  'в', 'во', 'на', 'у', 'к', 'ко', 'с', 'со', 'из', 'от', 'до', 'для', 'по', 'при', 'за',
  'над', 'под', 'о', 'об', 'про', 'без', 'между', 'через', 'как', 'что', 'чтобы', 'если',
  'есть', 'быть', 'можно', 'нужно', 'хочу', 'хотелось', 'нужен', 'нужна', 'нужно', 'рецепт', 'рецепты', 'рецептов', 'приготовить', 'приготовления', 'сделать', 'блюдо', 'блюда', 'блюд',
  'г', 'гр', 'грамм', 'кг', 'мг', 'мл', 'л', 'литр', 'литров', 'шт', 'штук',
  'ст', 'стакан', 'стакана', 'стаканов', 'ч', 'час', 'часа', 'часов', 'мин', 'минута',
  'минуты', 'минут', 'сек', 'секунда', 'секунды', 'секунд', 'по-вкусу',
]);

export function normalizePlainText(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/[’']/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

export function tokenize(value) {
  const words = normalizePlainText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
  const tokens = [];
  for (const word of words) {
    if (/^\d+$/.test(word) || word.length < 2 || stopwords.has(word)) continue;
    const token = /^[а-я]+$/u.test(word) ? stemmer.stem(word) : word;
    if (token.length >= 2 && !stopwords.has(token)) tokens.push(token);
  }
  return tokens;
}

export function phraseKey(value) {
  return normalizePlainText(value)
    .replace(/[^a-zа-я0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
