import { tokenize, phraseKey } from '../bm25/src/text.mjs';

const ingredientCache=new Map();
function ingredientInfo(value) {
  const key=String(value || '');
  let info=ingredientCache.get(key);
  if(!info) {
    const normalized=phraseKey(key);
    info={normalized,tokens:tokenize(normalized)};
    if(ingredientCache.size>50000)ingredientCache.clear();
    ingredientCache.set(key,info);
  }
  return info;
}
const nutNames=/орех|миндаль|фундук|арахис|кешью|фисташ|пекан|макадам|каштан/iu;
export function ingredientMatches(wanted,name) {
  const wantedInfo=ingredientInfo(wanted),nameInfo=ingredientInfo(name);
  const q=wantedInfo.normalized,n=nameInfo.normalized;
  if (/^орех(?:и|а|ов)?$/u.test(q)) return !/мускат/u.test(n) && nutNames.test(n);
  if (/^молок/u.test(q) && !/сгущ|сух|кокос|миндаль|соев|овсян/u.test(q) && /сгущ|сух|кокос|миндаль|соев|овсян/u.test(n)) return false;
  const tokens=wantedInfo.tokens,actual=nameInfo.tokens;
  return tokens.length>0 && tokens.every(t=>actual.some(a=>a===t || (t.length>=5 && a.startsWith(t))));
}
export function ingredientExcluded(wanted,name) {
  if(/^молок/u.test(phraseKey(wanted)) && /молок/u.test(phraseKey(name)))return true;
  return ingredientMatches(wanted,name);
}
export function validMacros(value) {
  if(!value || !Object.values(value).some(v=>typeof v==='number' && v>0))return null;
  return {...value,kcal:typeof value.kcal==='number' && value.kcal>0?value.kcal:null};
}
export function macroValues(recipe,basis='per100g') {
  const direct=validMacros(recipe.nutrition?.[basis]);
  if (direct) return direct;
  const whole=validMacros(recipe.nutrition?.wholeDish);
  if (basis==='perServing' && recipe.servings>0 && whole) {
    return Object.fromEntries(Object.entries(whole).map(([k,v])=>[k,typeof v==='number'?v/recipe.servings:null]));
  }
  return null;
}
export const rounded=n=>Math.round(n*100)/100;
export function scaleAmount(value,ratio) {
  if (!value || ratio===1) return value;
  const parse=text=>{
    const parts=text.trim().split(/\s+/);
    let number=0;
    for(const part of parts) {
      if(part.includes('/')) { const [a,b]=part.split('/').map(Number);if(!b)return null;number+=a/b; }
      else number+=Number(part.replace(',','.'));
    }
    return Number.isFinite(number)?number:null;
  };
  const match=String(value).match(/^(\s*)(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)(?:\s*[-–]\s*(\d+(?:[.,]\d+)?))?(.*)$/u);
  if (!match) return value;
  const a=parse(match[2]),b=match[3]?parse(match[3]):null;
  if(a===null)return value;
  return match[1]+String(rounded(a*ratio)).replace('.',',')+(b!==null?'–'+String(rounded(b*ratio)).replace('.',','):'')+match[4];
}
export function presentRecipe(recipe,{ingredients=[],servings=null}={}) {
  if (!recipe) return null;
  const originalServings=recipe.servings || null;
  const canScale=Boolean(servings && originalServings);
  const ratio=canScale?servings/originalServings:1;
  const ingredientEntries=(recipe.ingredients || []).map(i=>({...i,amount:scaleAmount(i.amount,ratio)}));
  const nutrition=Object.fromEntries(['per100g','perServing','wholeDish'].map(key=>[key,validMacros(recipe.nutrition?.[key])]));
  if(canScale && nutrition.wholeDish) nutrition.wholeDish=Object.fromEntries(Object.entries(nutrition.wholeDish).map(([k,v])=>[k,typeof v==='number'?rounded(v*ratio):null]));
  if(!nutrition.perServing) nutrition.perServing=macroValues(recipe,'perServing');
  const matchedIngredients=ingredients.filter(q=>(recipe.ingredients || []).some(i=>ingredientMatches(q,i.name)));
  const additionalIngredients=(recipe.ingredients || []).filter(i=>!ingredients.some(q=>ingredientMatches(q,i.name))).map(i=>i.name);
  const sourceUrl=/^https:\/\/(?:www\.)?povarenok\.ru\//i.test(recipe.sourceUrl || '')?recipe.sourceUrl:null;
  return {
    id:recipe.id,title:recipe.title,description:recipe.description || '',image:'/images/recipe-placeholder.svg',
    time:recipe.timeMinutes && !recipe.timeAnomaly?recipe.timeMinutes+' мин':'Время не указано',
    difficulty:'Сложность не указана',tag:recipe.categories?.at(-1) || 'Десерт',
    ingredients:ingredientEntries.map(i=>i.name+' — '+(i.amount || 'количество не указано')),ingredientEntries,
    steps:recipe.steps || [],aliases:recipe.aliases || [],requestCount:0,sourceUrl,checked:false,
    servings:canScale?servings:originalServings,originalServings,scaled:Boolean(canScale && ratio!==1),nutrition,
    matchedIngredients,additionalIngredients,
    portionNote:servings && !originalServings?'В источнике не указано число порций, поэтому количества не пересчитаны.':null,
  };
}
