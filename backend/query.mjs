import {parseQuery} from '../bm25/src/query.mjs';

// Normalize conversational units at the integration boundary; the BM25 parser
// and its scoring configuration remain owned by the retrieval module.
export function parseDialogueQuery(query) {
  const normalized=String(query).replace(
    /((?:не\s+дольше|не\s+более|максимум|менее|меньше|до|за)\s+)(полчаса|полутора\s+часов|часа?|одного\s+часа|один\s+час)(?![а-яё])/giu,
    (_,prefix,unit)=>prefix+(/полчаса/iu.test(unit)?'30 минут':/полутора/iu.test(unit)?'90 минут':'60 минут'));
  return parseQuery(normalized);
}
