import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { buildBm25Index, searchRecipes } from '../bm25/src/bm25.mjs';
import { parseDialogueQuery as parseQuery } from './query.mjs';
import { dessertIndex } from './catalog.mjs';
import { ingredientMatches, ingredientExcluded, macroValues, presentRecipe, recipeImage } from './recipe-data.mjs';
import { phraseKey, tokenize } from '../bm25/src/text.mjs';

export function toRecipe(r, requestCount=0) {
  if (!r) return null;
  return {
    id:r.id, title:r.title, description:r.description || '', image:recipeImage(r),
    time:r.timeMinutes && !r.timeAnomaly ? r.timeMinutes+' мин' : 'Время не указано',
    difficulty:'Сложность не указана', tag:r.categories?.at(-1) || 'Десерт',
    ingredients:(r.ingredients || []).map(i=>[i.name,i.amount].filter(Boolean).join(' — ')),
    steps:r.steps || [], aliases:r.aliases || [], requestCount,
    sourceUrl:/^https:\/\/(?:www\.)?povarenok\.ru\//i.test(r.sourceUrl || '') ? r.sourceUrl : null,
    servings:r.servings, nutrition:r.nutrition, checked:false,
  };
}
export function openSearch(filename) {
  let index;
  try { index=JSON.parse(gunzipSync(readFileSync(filename),{maxOutputLength:1024*1024*1024}).toString('utf8')); }
  catch { throw new Error('BM25 index unavailable. Run npm run prepare:data.'); }
  return makeSearch(index);
}
export function makeSearch(sourceIndex) {
  const index=dessertIndex(sourceIndex);
  const byId=new Map(index.documents.map(({recipe})=>[recipe.id,recipe]));
  const ingredientKey=name=>tokenize(name).join('|');
  const ingredientKeys=new Set([...byId.values()].flatMap(r=>(r.ingredients || []).map(i=>ingredientKey(i.name))).filter(Boolean));
  // Main titles only; aliases must not trigger the full-recipe mode.
  const exact=[...byId.values()].map(r=>[phraseKey(r.title),r]).filter(([name])=>name.length>1);
  return {
    size:byId.size,
    hasIngredient:name=>ingredientKeys.has(ingredientKey(name)),
    raw:id=>byId.get(id) || null,
    present:(id,options)=>presentRecipe(byId.get(id),options),
    find({ingredients=[],excludedIngredients=[],topic='',filters={},sort='relevance',basis='per100g',requireServings=false}={}) {
      const query=!ingredients.length && /^(?:рецепт[а-яё]*|десерт[а-яё]*)(?:\s+рецепт[а-яё]*|\s+десерт[а-яё]*)?$/iu.test(topic.trim())?'':[topic,...ingredients].filter(Boolean).join(' ');
      const parsed=parseQuery(query);
      const type=/^(?:пирог[а-я]*|торт[а-я]*|кекс[а-я]*|маффин[а-я]*|печенье|пудинг[а-я]*|суфле|мороженое|чизкейк[а-я]*|мусс[а-я]*)$/u.test(phraseKey(topic))?tokenize(topic):[];
      const scores=new Map(query?searchRecipes(index,query,{...parsed,limit:100}).map(r=>[r.recipe.id,r.score]):[]);
      let candidates=[...byId.values()].filter(r=>{
        const names=(r.ingredients || []).map(i=>i.name);
        if(type.length && !type.every(t=>tokenize([r.title,...(r.categories || []),...(r.aliases || [])].join(' ')).includes(t)))return false;
        if (!ingredients.every(q=>names.some(name=>ingredientMatches(q,name)))) return false;
        if (excludedIngredients.some(q=>names.some(name=>ingredientExcluded(q,name)))) return false;
        const titleTokens=tokenize(r.title.replace(/без\s+[а-яё-]+/giu,' '));
        if(excludedIngredients.some(q=>tokenize(q).some(t=>titleTokens.includes(t))))return false;
        if (!ingredients.length && query && !scores.has(r.id)) return false;
        if (requireServings && !(r.servings>0)) return false;
        if(filters.minTimeMinutes!=null && (r.timeMinutes==null || r.timeAnomaly || r.timeMinutes<filters.minTimeMinutes))return false;
        if(filters.minServings!=null && (!(r.servings>0) || r.servings<filters.minServings))return false;
        if(filters.maxServings!=null && (!(r.servings>0) || r.servings>filters.maxServings))return false;
        if(filters.maxTimeMinutes!=null && (r.timeMinutes==null || r.timeAnomaly || r.timeMinutes>filters.maxTimeMinutes))return false;
        if(filters.nutrition) {
          const macros=macroValues(r,filters.nutritionBasis || 'per100g');
          if(!macros)return false;
          for(const [key,bounds] of Object.entries(filters.nutrition)) {
            const v=macros[key];
            if(v==null || (bounds.min!=null && v<bounds.min) || (bounds.max!=null && v>bounds.max))return false;
          }
        }
        if(excludedIngredients.some(q=>/выпечк/u.test(q)) && !(r.categories || []).some(c=>/без\s+выпечк/iu.test(c)) && (r.rootCategory==='Выпечка' || (r.steps || []).some(step=>/выпека|духовк/iu.test(step))))return false;
        return true;
      });
      if(sort==='kcal_asc') {
        candidates=candidates.filter(r=>macroValues(r,basis)?.kcal!=null);
        candidates.sort((a,b)=>macroValues(a,basis).kcal-macroValues(b,basis).kcal || a.id.localeCompare(b.id));
      } else {
        const completeness=r=>(r.servings>0?2:0)+(macroValues(r,'per100g')?.kcal!=null?1:0);
        candidates.sort((a,b)=>(scores.get(b.id)||0)-(scores.get(a.id)||0) || completeness(b)-completeness(a) || a.title.localeCompare(b.title,'ru'));
      }
      return candidates;
    },
    recipe:id=>presentRecipe(byId.get(id)),
    run(query) {
      const parsed=parseQuery(query);
      if (parsed.clarificationRequired) return {status:'clarification',recipes:[],answer:
        parsed.clarificationRequired==='nutritionBasis' ? 'Уточните: КБЖУ на 100 г или на порцию?' : 'Укажите одну базу КБЖУ: на 100 г или на порцию.'};
      const clean=phraseKey(parsed.searchText);
      const inventoryQuery=/(?:^| )(?:у меня|есть|имеются|в наличии|из продуктов)(?: |$)/u.test(clean);
      const contained=inventoryQuery ? [] : exact.filter(([name])=>(' '+clean+' ').includes(' '+name+' '));
      const matches=contained.filter(([name])=>!contained.some(([other])=>other!==name && (' '+other+' ').includes(' '+name+' ')));
      if (new Set(matches.map(([name])=>name)).size>1) {
        return {status:'clarification',recipes:[],answer:'Вы указали несколько десертов. Уточните, какой приготовить первым.'};
      }
      // A family name shared by multiple source recipes is a selection, not an arbitrary full recipe.
      const exactIds=new Set(matches.map(([,r])=>r.id));
      const searchIndex=exactIds.size===1
        ? buildBm25Index([byId.get([...exactIds][0])],index.scoring) : index;
      const results=searchRecipes(searchIndex,query,{...parsed,limit:100}).filter(({recipe})=>{
        // Baking exclusions are already interpreted by BM25, including the "без выпечки" label.
        const positiveTitle=String(recipe.title).replace(/без\s+[а-яё-]+/giu,' ');
        const positiveTokens=new Set(tokenize(positiveTitle));
        return !parsed.exclusions.some(group=>group.some(t=>t!=='выпечк' && positiveTokens.has(t)));
      });
      const selected=exactIds.size===1 ? results.filter(({recipe})=>exactIds.has(recipe.id)).slice(0,1) : results.slice(0,3);
      if (!selected.length) return {status:'empty',recipes:[],answer:'Подходящие рецепты не найдены. Попробуйте изменить ингредиенты или ограничения.'};
      return {status:exactIds.size===1 ? 'exact' : 'found', recipes:selected.map(({recipe})=>toRecipe(recipe)),
        documents:selected.map(({recipe})=>recipe)};
    },
  };
}
