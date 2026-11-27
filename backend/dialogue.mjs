import {recipeMemory,resolveRecipeReference,rememberRecipes} from './recipe-memory.mjs';
import { phraseKey,tokenize } from '../bm25/src/text.mjs';
import { parseDialogueQuery as parseQuery } from './query.mjs';
import { ingredientMatches,ingredientExcluded,macroValues,rounded } from './recipe-data.mjs';

const FOOD=[
 ['ягоды',/ягод/u],['банан',/банан/u],['молоко',/молок/u],['мука',/мук[аиу]|мука/u],['орехи',/орех/u],
 ['овсяные хлопья',/овсян|овсяны[ех].*хлоп/u],['яйцо',/яйц|яиц/u],['творог',/творог/u],
 ['яблоко',/яблок|яблоч/u],['груша',/груш/u],['шоколад',/шоколад/u],['какао',/какао/u],
 ['сахар',/сахар/u],['мёд',/(?:^| )мед(?: |$|а)/u],['сливки',/сливк/u],['сметана',/сметан/u],
 ['кефир',/кефир/u],['йогурт',/йогурт/u],['печенье',/печень/u],['клубника',/клубник/u],
 ['малина',/малин/u],['вишня',/вишн/u],['изюм',/изюм/u],['миндаль',/миндал/u],
 ['арахис',/арахис/u],['фундук',/фундук/u],['кокос',/кокос/u],['лимон',/лимон/u],
 ['апельсин',/апельсин/u],['манная крупа',/манк|манн/u],['рис',/(?:^| )рис/u],
 ['желатин',/желатин/u],['овощи',/овощ/u],['огурец',/огур/u],['помидор',/помидор|томат/u],['финик',/финик/u],
 ['тыква',/тыкв/u],['морковь',/морков/u],['масло сливочное',/сливочн.*масл|масл.*сливочн/u],
];
const list=value=>Array.isArray(value)?[...new Set(value.filter(x=>typeof x==='string').map(x=>x.trim().slice(0,70)).filter(Boolean))].slice(0,12):[];
export function cleanContext(value,search) {
  const c=value && typeof value==='object'?value:{};
  const ids=Array.isArray(c.displayedIds)?c.displayedIds.filter(id=>typeof id==='string' && search.raw?.(id)).slice(0,3):[];
  return {version:3,...recipeMemory(c,search),ingredients:list(c.ingredients).filter(x=>!/аллерги|предлож|пожалуй|приготов|что то|что нибудь|без них/iu.test(x)),excludedIngredients:list(c.excludedIngredients),allergies:list(c.allergies),pendingAction:c.pendingAction?.type==='broaden_search'?{type:'broaden_search'}:null,
    searchSeenIds:Array.isArray(c.searchSeenIds)?[...new Set(c.searchSeenIds.filter(id=>typeof id==='string' && search.raw?.(id)))]:ids,
    topic:typeof c.topic==='string'?c.topic.slice(0,300):'',displayedIds:ids,
    selectedRecipeId:typeof c.selectedRecipeId==='string' && search.raw?.(c.selectedRecipeId)?c.selectedRecipeId:null,
    servings:Number.isInteger(c.servings) && c.servings>0 && c.servings<=100?c.servings:null,
    pendingRecipeQuestion:typeof c.pendingRecipeQuestion==='string'?c.pendingRecipeQuestion.slice(0,500):null,
    pendingNutritionRequest:typeof c.pendingNutritionRequest==='string'?c.pendingNutritionRequest.slice(0,500):null,
    pendingNutritionQuery:typeof c.pendingNutritionQuery==='string'?c.pendingNutritionQuery.slice(0,500):null,
    filters:c.filters && typeof c.filters==='object'?safeFilters(c.filters):{},sort:c.sort==='kcal_asc'?'kcal_asc':'relevance'};
}
function safeFilters(filters) {
  const out={};
  for(const key of ['minTimeMinutes','maxTimeMinutes','minServings','maxServings'])
    if(Number.isFinite(filters[key]) && filters[key]>=0)out[key]=Math.min(filters[key],key.includes('Time')?1440:100000);
  if(['per100g','perServing'].includes(filters.nutritionBasis))out.nutritionBasis=filters.nutritionBasis;
  if(filters.nutrition && typeof filters.nutrition==='object') {
    out.nutrition={};
    for(const k of ['kcal','protein','fats','carbs']) {
      const bounds=filters.nutrition[k];if(!bounds || typeof bounds!=='object')continue;
      const clean={};for(const bound of ['min','max'])if(Number.isFinite(bounds[bound]) && bounds[bound]>=0)clean[bound]=Math.min(bounds[bound],100000);
      if(Object.keys(clean).length)out.nutrition[k]=clean;
    }
  }
  return out;
}
function knownFoods(query) {
  const q=phraseKey(query);
  return FOOD.map(([name,re])=>({name,index:q.search(re)})).filter(x=>x.index>=0).sort((a,b)=>a.index-b.index).map(x=>x.name);
}
function inventoryFoods(query,search) {
  if(/^(?:а\s+)?(?:с|со|из)\s+(?:чем|чего|какого|какой|каких|ним|них|него|этого)(?:\s|[?.!]|$)/iu.test(query))return null;
  if(/аллерги|непереносимост/iu.test(query))return null;
  const match=query.match(/^(.+?)\s+(?:есть|имеются|в наличии)(?:\s+у меня)?(?:[,.!?].*|\s*)$/iu)
    || query.match(/(?:у меня(?:\s+есть)?|(?:^|\s)есть|имеются|в наличии)\s+(.+)/iu)
    || query.match(/^(?:а\s+|тогда\s+|лучше\s+)?(?:с|со|из)\s+(.+)/iu);
  if(!match) {
    if(/(?:^| )(?:без|кроме|не|нет|исключи|убери|добавь|добавим|добавить|вместо|замени)(?: |$)/u.test(phraseKey(query)))return null;
    // A bare list is a complete pantry request too, not an addition to the
    // previous failed search. Explicit «добавь» still follows the additive path.
    const known=knownFoods(query),terms=tokenize(query),foodTerms=tokenize(known.join(' '));
    if(known.length && terms.length && terms.every(t=>foodTerms.includes(t)))return known;
    const parts=query.split(/[,;]|\s+и\s+/iu).map(part=>part.trim()).filter(Boolean);
    return parts.length && parts.every(part=>search.hasIngredient?.(part))?list(parts):null;
  }
  const body=match[1].split(/[?.!]|(?:,?\s+)(?:что можно|что приготовить|что посоветуешь|хочу приготовить|хочу сделать)/iu)[0];
  const foods=body.split(/[,;]|\s+(?:и|с)\s+/iu).map(part=>{
    const clean=part.replace(/\d+(?:[.,]\d+)?\s*(?:г|гр|мл|кг|шт)?\b/giu,' ').replace(/немного|чуть-чуть|только|еще/giu,' ').trim();
    const known=knownFoods(clean);
    if(/кокосов|сгущ|миндальн|растительн|грецк/iu.test(clean))return clean;
    if(known.length===1)return known[0];
    // Accept an unambiguous truncated food name only inside an explicit pantry.
    const key=phraseKey(clean);
    const completions=key.length>=4 && !key.includes(' ')?FOOD.map(([name])=>name).filter(name=>phraseKey(name).startsWith(key)):[];
    return completions.length===1?completions[0]:clean;
  }).filter(Boolean);
  return list(foods);
}
function allergyFoods(query) {
  if(/(?:нет|не бывает|не было)\s+аллерги/iu.test(query))return [];
  const result=[];
  for(const match of query.matchAll(/(?:аллерги[а-яё]*|непереносимост[а-яё]*)\s+на\s+([^,.!?;]+)/giu)) {
    for(const item of match[1].split(/\s+и\s+/iu)) {
      const known=knownFoods(item);
      result.push(...(known.length?known:[item.trim()]));
    }
  }
  return list(result);
}
function confirmation(query) {
  const q=phraseKey(query);
  if(/^(?:да|ага|угу|давай|давайте|конечно|хорошо|подбери|подбирай|попробуй|согласна|согласен)(?: |$)/u.test(q))return true;
  if(/^(?:нет|не надо|не нужно|отмена)(?: |$)/u.test(q))return false;
  return null;
}
function portions(query) {
  const q=phraseKey(query);const numbers={одного:1,один:1,двух:2,два:2,троих:3,трех:3,три:3,четырех:4,четыре:4,пять:5,пятерых:5,шесть:6,шестерых:6,семь:7,восемь:8,девять:9,десять:10};
  const match=q.match(/на (\d+|одного|один|двух|два|троих|трех|три|четырех|четыре|пять|пятерых|шесть|шестерых|семь|восемь|девять|десять) (?:человек|чел|персон|порц)/u);
  return match?(Number(match[1]) || numbers[match[1]]):null;
}
function timeQuestion(query) {
  return /времен[иа]|по времени|долго|длительност|сколько.*(?:минут|час|готов|варить|печь|выпек)|когда.*готов/iu.test(query);
}
function unsupportedDessertRequest(text) {
  const soup=/(?:^| )(?:суп[а-я]*|борщ[а-я]*|щи|солянк[а-я]*|ух[а-я]*|окрошк[а-я]*)(?: |$)/u.test(text);
  const savoryIngredient=/(?:^| )(?:куриц[а-я]*|мяс[а-я]*|говядин[а-я]*|свинин[а-я]*|рыб[а-я]*|колбас[а-я]*|картоф[а-я]*)(?: |$)/u.test(text);
  const savorySalad=/(?:^| )салат(?: |$)/u.test(text) &&
    /(?:^| )(?:огур[а-я]*|помидор[а-я]*|томат[а-я]*|куриц[а-я]*|мяс[а-я]*|колбас[а-я]*|рыб[а-я]*|картоф[а-я]*|капуст[а-я]*)(?: |$)/u.test(text);
  const dessert=/(?:^| )(?:десерт[а-я]*|торт[а-я]*|пирог[а-я]*|кекс[а-я]*|печень[а-я]*|пудинг[а-я]*|суфле|морожен[а-я]*|чизкейк[а-я]*|мусс[а-я]*|конфет[а-я]*)(?: |$)/u.test(text);
  return soup || savorySalad || (savoryIngredient && !dessert);
}
function basis(query) {query=phraseKey(query);return /на порци/iu.test(query)?'perServing':/весь|все блюдо|целый/iu.test(query)?'wholeDish':'per100g';}
function canonicalNutrition(recipe,query) {
  const key=basis(query),values=macroValues(recipe,key);
  return {recipeId:recipe.id,title:recipe.title,basis:key,basisLabel:key==='perServing'?'на порцию':key==='wholeDish'?'на всё блюдо':'на 100 г',
    values:values?Object.fromEntries(Object.entries(values).map(([k,v])=>[k,typeof v==='number'?rounded(v):null])):null};
}
export async function converse({query,context,history=[],search,llm}) {
  const state=cleanContext(context,search),prior={...state};
  const text=phraseKey(query),targetServings=portions(query);
  if(unsupportedDessertRequest(text))
    return answerResult('clarification','SweetMate подбирает только десерты, поэтому этот несладкий запрос не подходит каталогу. Напишите, какой десерт хотите найти, или перечислите продукты для десерта.',[],null,null,state,'not_needed','clarification');
  const more=/^(?:а )?(?:еще|другие|другие варианты|еще варианты|что еще|покажи еще|предложи еще|давай еще)(?: пожалуйста)?$/u.test(text);
  const declaredAllergies=allergyFoods(query);
  const rememberedAllergies=history.filter(m=>m.role==='user').flatMap(m=>allergyFoods(m.text || ''));
  state.allergies=list([...state.allergies,...rememberedAllergies,...declaredAllergies]);
  const yes=confirmation(query);
  const previousOffer=[...history].reverse().find(m=>m.role==='assistant')?.text || '';
  const oldOffer=yes===true && /\?/u.test(previousOffer) && /(?:могу|хотите|может|давай|давайте|предлагаю).*(?:убрать|исключить|друг|отдельно|подобрать|поиск)/iu.test(previousOffer);
  const confirmBroader=yes===true && Boolean(state.pendingAction);
  if(yes===false && state.pendingAction) {
    state.pendingAction=null;
    return answerResult('found','Хорошо, сохраняю текущие ограничения. Напишите, какие продукты или условия можно изменить.',[],null,null,state,'not_needed','chat');
  }
  if(confirmBroader) {state.ingredients=[];state.topic='десерт';state.pendingAction=null;}
  state.excludedIngredients=list([...state.excludedIngredients,...state.allergies]);
  let parsed=parseQuery(query);
  if(state.pendingNutritionQuery && /100 ?г|на порци/u.test(text))parsed=parseQuery(state.pendingNutritionQuery+' '+query);
  const excluded=knownFoods(query).filter(food=>parsed.exclusions.some(group=>group.some(term=>tokenize(food).includes(term))));
  excluded.push(...declaredAllergies);
  // Short corrections like «не бананы» are exclusions too. Do not confuse
  // numeric operators («не больше», «не дольше») or «не только» with a ban.
  for(const match of query.matchAll(/(?:^|\s)не\s+([а-яё-]+(?:\s+[а-яё-]+)?)/giu)) {
    if(!/^(?:только|более|менее|больше|меньше|дольше|знаю|уверен|уверена)(?:\s|$)/iu.test(match[1]))
      excluded.push(...knownFoods(match[1]));
  }
  // Preserve category exclusions as well as named foods (e.g. «не хочу торт»).
  for(const group of parsed.exclusions)if(!excluded.some(food=>tokenize(food).some(t=>group.includes(t))))excluded.push(group.join(' '));
  if(/без них|без этого|без таких/iu.test(query))excluded.push(...state.allergies);
  const foods=knownFoods(query).filter(food=>!excluded.includes(food));
  if(parsed.exclusions.some(group=>group.includes('выпечк') || group.includes('духовк')))excluded.push('выпечка');
  const inventory=inventoryFoods(query,search);
  const ingredientRefinement=/^(?:а |тогда |лучше )?(?:с|со|из) /u.test(text);
  const requestedType=!inventory && /^(?:а |тогда |теперь |лучше )?(?:хочу|давай|давайте|подбери|предложи|найди|покажи)(?: |$)/u.test(text)
    ? text.match(/(?:^| )(пирог[а-я]*|торт[а-я]*|кекс[а-я]*|маффин[а-я]*|печенье|пудинг[а-я]*|суфле|мороженое|чизкейк[а-я]*|мусс[а-я]*)(?: |$)/u)?.[1]:null;
  let action=null,understood=null;
  if(requestedType || excluded.length || inventory?.length || declaredAllergies.length || confirmBroader || oldOffer || more || parsed.filters.nutrition || parsed.filters.maxTimeMinutes!=null)action='search';
  else if(/меньше.*калори|калори.*меньше|менее калори|низкокалори|самый легкий|самое легкое|сравни.*калори/u.test(text))action='calories';
  else if(/кбжу|бжу|калори|ккал|белков|белка|углеводов|жиров|пищевая ценность/u.test(text))action='nutrition';
  else if(state.pendingNutritionRequest && /^(?:у )?(?:перв|втор|трет|послед)|^на 100|^на порци/u.test(text))action='nutrition';
  else if(targetServings)action='servings';
  else if(state.pendingRecipeQuestion && (/^(?:у )?(?:перв|втор|трет|послед)/u.test(text) || resolveRecipeReference(query,state,search).explicit))action='discuss';
  else if(timeQuestion(query))action='discuss';
  else if(/порци|размер|вес.*(?:десерт|блюд)|сколько.*(?:грамм|выход)/u.test(text) ||
    ((state.selectedRecipeId || state.displayedIds.length) && /^(?:а |и )?(?:почему|зачем|насколько|можно ли|как понять|как узнать|что значит|чем заменить|как хранить|сколько хранить)/u.test(text)))action='discuss';
  else if(/^(?:перв[а-я]*|втор[а-я]*|трет[а-я]*|выбираю|открой|покажи рецепт)|как .*готов|шаги/u.test(text))action='choose';
  else if(/^(?:привет|здравствуй|спасибо|добрый|что ты умеешь|что умеешь|как тебя зовут)/u.test(text) && !foods.length)action='chat';
  if(more && !prior.ingredients.length && !prior.topic)return answerResult('clarification','Какие варианты подобрать? Назовите продукты или десерт.',[],null,null,state,'not_needed');
  const exactResult=!action && !inventory && !excluded.length && !parsed.clarificationRequired && search.run?search.run(query):null;
  const exactId=exactResult?.status==='exact'?exactResult.recipes[0]?.id:null;
  if(exactId) {action='choose';state.selectedRecipeId=exactId;}
  if(!action && (inventory?.length || foods.length))action='search';
  if(exactResult?.status==='clarification')return answerResult('clarification',exactResult.answer,[],null,null,state,'not_needed');
  // Random Latin typing is not a request to repeat the previous recipe action.
  if(!action && !inventory && !foods.length && /[a-z]/iu.test(query) && !/[а-яё]/iu.test(query) && !exactId) {
    return answerResult('clarification','Не поняла сообщение. Напишите вопрос о рецепте или продуктах, например: «Сколько калорий у первого десерта?»',[],null,null,state,'not_needed');
  }
  const simpleInventory=Boolean(inventory?.length) && !/замени|вместо|добавь|что нибудь|какой нибудь/u.test(text);
  if(!action && excluded.length)action='search';
  if(!action && !simpleInventory && llm.interpret)understood=await llm.interpret(query,state,history);
  if(!action && !understood && prior.knownRecipeIds.length && exactResult?.status==='empty') {
    return answerResult('clarification','Не поняла сообщение. Уточните вопрос или напишите, какие другие продукты использовать.',[],null,null,prior,'not_needed');
  }
  const actions=['search','nutrition','calories','servings','choose','chat','clarification','discuss'];
  action=action || (actions.includes(understood?.action)?understood.action:'search');
  if(action==='chat' && (state.selectedRecipeId || state.displayedIds.length) &&
      /^(?:а |и )?(?:как|почему|зачем|насколько|можно|сколько|чем|что значит)/u.test(text))action='discuss';
  if(understood?.action==='calories' && !/калори|ккал|энерг|легч|легк|диет/u.test(text)) {
    return answerResult('clarification','Не поняла, что вы хотите уточнить. Можно спросить о составе, приготовлении, калориях или порциях.',[],null,null,prior,'not_needed');
  }
  if(understood && ['search','choose'].includes(action)) {
    const allowed=tokenize(query+' '+prior.ingredients.join(' ')+' '+prior.excludedIngredients.join(' '));
    const grounded=items=>list(items).filter(item=>tokenize(item).some(t=>allowed.some(a=>a===t || (a.length>=4 && t.startsWith(a)) || (t.length>=4 && a.startsWith(t)))));
    if(Array.isArray(understood.ingredients))state.ingredients=grounded(understood.ingredients);
    if(Array.isArray(understood.excludedIngredients))state.excludedIngredients=grounded(understood.excludedIngredients);
    if(typeof understood.topic==='string')state.topic=understood.topic.slice(0,300);
    if(Number.isInteger(understood.servings) && understood.servings>0 && understood.servings<=100)state.servings=understood.servings;
  }
  if(['search','calories','servings','chat','choose'].includes(action)) {
    state.pendingNutritionRequest=null;state.pendingRecipeQuestion=null;
  }
  if(action==='search') {
    state.selectedRecipeId=null;
    if(!more)state.searchSeenIds=[];
    if(requestedType) {
      const modifier=parsed.searchText.match(/(?:^|\s)(?:с|со|из)\s+(.+)/iu);
      state.ingredients=modifier?(inventoryFoods('с '+modifier[1],search) || foods):foods;
      state.topic=requestedType;state.sort='relevance';
    } else if(simpleInventory || (!understood && foods.length && !prior.ingredients.length)) {
      state.ingredients=simpleInventory?inventory:foods;
      state.excludedIngredients=list([...(ingredientRefinement?prior.excludedIngredients:[]),...excluded,...state.allergies]);
      const previousType=/^(?:пирог[а-я]*|торт[а-я]*|кекс[а-я]*|маффин[а-я]*|печенье|пудинг[а-я]*|суфле|мороженое|чизкейк[а-я]*|мусс[а-я]*)$/u.test(prior.topic);
      state.topic=ingredientRefinement && previousType?prior.topic:state.ingredients.join(' ');
      state.filters=ingredientRefinement?prior.filters:{};state.sort='relevance';state.selectedRecipeId=null;
    } else if(!understood && foods.length && !simpleInventory && !excluded.length) {
      const specificBerry=foods.some(food=>/клубника|малина|вишня/u.test(food));
      state.ingredients=list([...(specificBerry?state.ingredients.filter(food=>food!=='ягоды'):state.ingredients),...foods]);
      state.topic=state.ingredients.join(' ');
    } else if(!understood && foods.length && /добав|еще/u.test(text))state.ingredients=list([...state.ingredients,...foods]);
    else if(!understood && !foods.length && !more && !confirmBroader && !oldOffer && !excluded.length && parsed.searchText)state.topic=parsed.searchText;
    state.pendingAction=null;
    state.excludedIngredients=list([...state.excludedIngredients,...excluded,...state.allergies]);
    state.ingredients=state.ingredients.filter(food=>!state.excludedIngredients.some(ex=>ingredientExcluded(ex,food)));
  }
  state.excludedIngredients=list([...state.excludedIngredients,...state.allergies]);
  if(action==='search' && (declaredAllergies.length || oldOffer || excluded.some(ex=>ingredientExcluded(ex,state.topic))))
    state.topic=state.ingredients.filter(food=>!state.excludedIngredients.some(ex=>ingredientExcluded(ex,food))).join(' ') || 'десерт';
  state.ingredients=state.ingredients.filter(food=>!state.allergies.some(ex=>ingredientExcluded(ex,food)));
  if(parsed.clarificationRequired) {
    state.pendingNutritionQuery=query;
    return answerResult('clarification','Уточните, КБЖУ нужны на 100 г или на порцию.',[],null,null,state,'not_needed');
  }
  state.pendingNutritionQuery=null;
  state.filters={...state.filters,...safeFilters(parsed.filters)};
  if(targetServings && targetServings<=100)state.servings=targetServings;
  const resolved=resolveRecipeReference(query,state,search,understood?.reference || '');
  if(resolved.explicit && !resolved.id && ['choose','nutrition','servings','discuss'].includes(action)) {
    if(action==='nutrition')state.pendingNutritionRequest=query;
    if(action==='discuss')state.pendingRecipeQuestion=query;
    const choices=resolved.candidates.map(id=>'«'+search.raw(id).title+'»').join(', ');
    return answerResult('clarification',choices?'В этом чате есть несколько подходящих блюд: '+choices+'. Уточните полное название.':'Уточните блюдо: назовите его или укажите номер и подборку, например «второе из первой подборки».',[],null,null,state,'not_needed',action);
  }
  const picked=resolved.id || (!resolved.explicit && !state.selectedRecipeId && state.displayedIds.length===1 && ['nutrition','discuss'].includes(action)?state.displayedIds[0]:null);
  if(picked && ['choose','nutrition','servings','discuss'].includes(action))state.selectedRecipeId=picked;
  if(action==='nutrition' && !state.selectedRecipeId) {
    const name=query.replace(/кбжу|бжу|покажи|скажи|какая|какое|какой|сколько|калори[а-яё]*|ккал|белк[а-яё]*|жир[а-яё]*|углевод[а-яё]*|пожалуйста|на 100\s*г|на порци[а-яё]*|в предыдущем|в этом|у этого|этого блюда|у первого|у второго|у третьего|рецепт[а-яё]*|десерт[а-яё]*/giu,' ').replace(/^[\s?.,!у]+|[\s?.,!]+$/gu,'').trim();
    if(tokenize(name).some(t=>t.length>=3) && !/^(?:в|у|на|там|его|ее|предыдущ|эт|перв|втор|трет)(?:\s|$)/u.test(phraseKey(name))) {
      const choices=search.find({topic:name});
      const targetTokens=tokenize(name);
      const exact=choices.filter(r=>targetTokens.every(t=>tokenize(r.title).includes(t)));
      if(exact.length===1)state.selectedRecipeId=exact[0].id;

    }
  }

  let records=[],detail=null,nutrition=null,discussion=null,status='found',fallback='',notes=[];
  if(action==='clarification') {
    status='clarification';fallback='Не поняла, что вы хотите уточнить. Спросите о составе, приготовлении, КБЖУ или порциях выбранного блюда.';
  } else if(action==='discuss') {
    const discussionQuery=prior.pendingRecipeQuestion && resolved.explicit && !timeQuestion(query) && !/порци|размер|вес|грамм|почему|зачем/iu.test(query)?prior.pendingRecipeQuestion:query;
    if(!state.selectedRecipeId) {
      status='clarification';state.pendingRecipeQuestion=discussionQuery;
      fallback=state.displayedIds.length?'О каком десерте рассказать? Напишите название или «у первого», «у второго».':'Выберите рецепт или назовите десерт, о котором хотите спросить.';
    } else {
      state.pendingRecipeQuestion=null;state.pendingNutritionRequest=null;
      const r=search.present(state.selectedRecipeId,{ingredients:state.ingredients,servings:state.servings});
      const isTime=timeQuestion(discussionQuery);
      const portionQuestion=/порци|размер|вес|грамм|выход/iu.test(discussionQuery);
      discussion={question:discussionQuery,type:isTime?'cooking_time':portionQuestion?'portion_size':'recipe_question',recipe:{
        id:r.id,title:r.title,servings:r.servings,originalServings:r.originalServings,
        ...(isTime?{time:r.time,timeMinutes:search.raw(r.id).timeAnomaly?null:search.raw(r.id).timeMinutes || null}:portionQuestion?{}:{ingredients:r.ingredients,steps:r.steps,time:r.time}),
      },portionWeightGrams:null,weightKnown:false,
      sourceFacts:isTime?[r.time==='Время не указано'?'В источнике время приготовления не указано.':'Время приготовления по источнику: '+r.time+'. Не добавляй своё время ожидания или заморозки.']:portionQuestion?[
        r.servings?'Рецепт рассчитан на '+r.servings+' порций; одна порция — 1/'+r.servings+' готового десерта.':'Число порций в источнике не указано.',
        'Вес готового десерта и одной порции в граммах в используемых данных не указан.',
        'Пищевая ценность на 100 г — база КБЖУ, она не означает, что одна порция весит 100 г.',
        'Чтобы определить вес порции, взвесьте готовый десерт и разделите вес на число порций.',
      ]:r.steps.length?[]:['В данных источника нет шагов приготовления этого блюда. Нельзя подтверждать, что упомянутое в вопросе действие требуется этим рецептом.']};
      fallback=isTime?(r.time==='Время не указано'?'Для «'+r.title+'» в источнике не указано время приготовления. Я не буду придумывать длительность.':'Время приготовления «'+r.title+'» по источнику — '+r.time+'.'):portionQuestion?'Для «'+r.title+'» '+(r.servings?'указано '+r.servings+' порций. Одна порция — 1/'+r.servings+' готового десерта. ':'число порций в источнике не указано. ')+
        'Вес одной порции в граммах не указан. Его можно узнать, взвесив готовый десерт и разделив вес на число порций. Значения КБЖУ на 100 г не определяют размер порции.':
        r.steps.length?'В шагах рецепта «'+r.title+'» указано: '+r.steps.join(' '):
        'В данных источника для «'+r.title+'» нет шагов приготовления, поэтому я не могу подтвердить, что это действие нужно именно в этом рецепте. Пришлите текст шага — помогу разобраться.';
    }
  } else if(action==='chat') {
    fallback='Я помогу подобрать десерт по продуктам, сравнить калорийность, узнать КБЖУ и пересчитать рецепт на нужное число порций. Какие продукты у вас есть?';
  } else if(action==='nutrition') {
    if(!state.selectedRecipeId) {
      status='clarification';
      state.pendingNutritionRequest=query;
      records=[];
      fallback=state.displayedIds.length?'Для какого десерта показать КБЖУ? Назовите блюдо или напишите «у первого», «у второго».':'Сначала выберите рецепт или назовите десерт, для которого нужны КБЖУ.';
    } else {
      const r=search.present(state.selectedRecipeId,{ingredients:state.ingredients,servings:state.servings});
      state.pendingNutritionRequest=null;
      nutrition=canonicalNutrition(r,/100|порци|весь|все блюдо/u.test(text)?query:(prior.pendingNutritionRequest || query));
      fallback=nutrition.values?'Для «'+r.title+'» '+nutrition.basisLabel+': '+[
        ['kcal','калории','ккал'],['protein','белки','г'],['fats','жиры','г'],['carbs','углеводы','г']
      ].map(([key,label,unit])=>label+' — '+(nutrition.values[key]==null?'нет данных':nutrition.values[key]+' '+unit)).join('; ')+'. По данным источника.':'В источнике нет КБЖУ «'+r.title+'» '+nutrition.basisLabel+'. Я не буду придумывать значения.';
      records=[search.raw(r.id)];
    }
  } else if(action==='choose') {
    if(state.selectedRecipeId) {
      records=[search.raw(state.selectedRecipeId)];detail=search.present(state.selectedRecipeId,{ingredients:state.ingredients,servings:state.servings});
      fallback='Открыла «'+detail.title+'». Ниже состав и шаги из источника. Что хотите уточнить?';status='exact';
    } else if(understood?.topic) {
      records=search.find({ingredients:state.ingredients,excludedIngredients:state.excludedIngredients,topic:state.topic,filters:state.filters}).slice(0,3);
      status=records.length?'found':'empty';
      fallback=records.length?'Нашла варианты. Выберите карточку, чтобы открыть рецепт.':'';
    } else {
      status='clarification';fallback='Какой рецепт открыть? Выберите карточку или напишите «первый», «второй», «третий».';
    }
  } else if(action==='calories') {
    const key=basis(query);
    if(!state.displayedIds.length && !state.ingredients.length && !state.topic) {
      status='clarification';fallback='Какие десерты сравнить? Сначала назовите продукты или выберите рецепты.';
    } else {
      const amongShown=state.displayedIds.length && !/друг|еще|подбери|найди/u.test(text);
      records=amongShown?state.displayedIds.map(id=>search.raw(id)):
        search.find({ingredients:state.ingredients,excludedIngredients:state.excludedIngredients,topic:state.topic,filters:state.filters,sort:'kcal_asc',basis:key});
      const comparison=r=>macroValues(search.present(r.id,{servings:state.servings}),key);
      records=records.filter(r=>comparison(r)?.kcal!=null).sort((a,b)=>comparison(a).kcal-comparison(b).kcal).slice(0,3);
      state.sort='kcal_asc';state.selectedRecipeId=null;
      const label=key==='perServing'?'на порцию':key==='wholeDish'?'на всё блюдо':'на 100 г';
      fallback=records.length?'Из этих вариантов меньше всего калорий у «'+records[0].title+'». По возрастанию калорийности '+label+': '+records.map(r=>'«'+r.title+'» — '+rounded(comparison(r).kcal)+' ккал').join('; ')+'. Выберите рецепт или попросите подобрать другие варианты.':'В источнике недостаточно данных, чтобы сравнить калорийность на выбранной базе.';
      notes.push('Сравнивать только одну базу КБЖУ: '+key);
    }
  } else if(action==='servings') {
    if(!state.servings) {status='clarification';fallback='На сколько человек пересчитать рецепт?';}
    else {
      records=state.selectedRecipeId?[search.raw(state.selectedRecipeId)]:state.displayedIds.map(id=>search.raw(id));
      if(!records.length) {status='clarification';fallback='Какой десерт приготовить на '+state.servings+' человек? Сначала назовите продукты или выберите рецепт.';}
      else {
        const scalable=records.filter(r=>r.servings>0);
        if(!scalable.length) {
          status='clarification';notes.push('В источнике нет исходного числа порций, математический пересчёт невозможен.');
          fallback='Для этих рецептов не указано исходное число порций. Выберите другой рецепт с известным числом порций — тогда я пересчитаю количества на '+state.servings+' человек.';
        } else {
          records=scalable;
          fallback=records.map(r=>{
            const card=search.present(r.id,{ingredients:state.ingredients,servings:state.servings});
            const amounts=card.ingredientEntries.slice(0,4).map(i=>i.name+' — '+(i.amount || 'количество не указано')).join('; ');
            return '«'+r.title+'»: пересчитала с '+r.servings+' на '+state.servings+' порций. '+amounts+'.';
          }).join(' ')+' Полный пересчитанный состав — в карточке. Количества внутри исходного текста шагов могут оставаться прежними; используйте новый список ингредиентов.';
        }
      }
    }
  } else {
    if(!state.ingredients.length && !state.topic) {
      status='clarification';fallback='Расскажите, какие продукты есть. Например: «У меня есть банан и молоко. Что можно приготовить?»';
    } else {
      records=search.find({ingredients:state.ingredients,excludedIngredients:state.excludedIngredients,topic:state.topic,filters:state.filters,
        sort:state.sort,requireServings:Boolean(state.servings)}).filter(r=>!more || !state.searchSeenIds.includes(r.id)).slice(0,3);
      // A new allergy request asks for alternatives immediately. If the old
      // pantry had no matches (e.g. durian), do not keep that failed list stuck.
      if(!records.length && declaredAllergies.length && !inventory && !requestedType) {
        const alternatives=search.find({ingredients:[],excludedIngredients:state.excludedIngredients,topic:'десерт',filters:state.filters,
          sort:state.sort,requireServings:Boolean(state.servings)}).slice(0,3);
        if(alternatives.length) {state.ingredients=[];state.topic='десерт';records=alternatives;}
      }
      fallback=records.length?'Подобрала десерты со всеми указанными продуктами. На карточках отмечено совпадение; дополнительные ингредиенты перечислены отдельно. Что вам больше нравится?':'';
      if(!records.length) {
        status='empty';fallback='';state.pendingAction=null;
      }
    }
  }
  if(action==='search')state.searchSeenIds=[...new Set([...state.searchSeenIds,...records.map(r=>r.id)])];
  const cards=records.map(r=>search.present(r.id,{ingredients:state.ingredients,servings:state.servings}));
  if(cards.length && (['search','calories','servings'].includes(action) || !state.displayedIds.length))state.displayedIds=cards.map(r=>r.id);
  if(cards.length===1 && action==='choose')state.selectedRecipeId=cards[0].id;
  rememberRecipes(state,[...new Set([...cards.map(r=>r.id),...(detail?[detail.id]:[]),...(nutrition?[nutrition.recipeId]:[])])],
    {group:['search','calories'].includes(action)});
  const result={action,status,pendingAction:state.pendingAction,allergies:state.allergies,recipes:cards,recipeDetail:detail,nutrition,discussion,notes,fallback};
  // Numeric replies are composed from canonical source values. Free-form generation
  // cannot reliably preserve the comparison winner, basis, or scaled quantities.
  const factual=discussion?.type==='cooking_time' || ['nutrition','calories','servings','clarification'].includes(action) || (action==='discuss' && !discussion) || (action==='search' && status==='empty');
  let generation={answer:null,llmStatus:factual?'not_needed':'not_configured'};
  if(!factual && llm.reply)generation=await llm.reply(query,state,history,result);
  const generatedAnswer=generation.answer;
  // Free-form search/selection text must not introduce another numeric nutrition
  // claim outside the canonical nutrition/comparison actions.
  if(!factual && generation.answer) {
    generation.answer=generation.answer.split(/(?<=[.!?])\s+/u).filter(sentence=>
      !(/\d/u.test(sentence) && /ккал|калори|белк|жир|углевод/iu.test(sentence))).join(' ').trim() || null;
  }
  // A recommendation turn must not invent a cooking procedure outside the
  // requested source recipe. The full steps remain accessible from each card.
  if(action==='search' && /(?:^|[.!?]\s+)(?:можно\s+)?(?:возьмите|добавьте|смешайте|растопите|выпекайте|варите|охладите|украсьте|разомните|нарежьте|разложите|разогрейте|взбейте)|(?:шоколад|ягоды|молоко|сливки)\s+(?:растопите|добавьте|взбейте|охладите)/iu.test(generation.answer || ''))generation.answer=null;
  if(action==='search' && !state.selectedRecipeId && /вы выбрали|вы остановились|ваш выбор/iu.test(generation.answer || ''))generation.answer=null;
  if(discussion?.type==='recipe_question' && !discussion.recipe.steps.length &&
      /почему|зачем|как понять|как узнать/iu.test(discussion.question) && generation.answer &&
      !/(?:нет|отсутствуют|не указаны|не приведены)[^.!?]{0,40}(?:шаг|инструкци)|(?:шаг|инструкци)[^.!?]{0,40}(?:нет|не указан|отсутств)/iu.test(generation.answer))generation.answer=null;
  if(discussion?.type==='portion_size' && generation.answer) {
    const answer=generation.answer;
    const numbers=(answer.match(/\d+(?:[.,]\d+)?/g) || []).map(n=>Number(n.replace(',','.')));
    const allowed=[1,100,discussion.recipe.servings,discussion.recipe.originalServings].filter(n=>typeof n==='number');
    const noWeight=/(?:вес|масс)[^.!?]{0,55}(?:не указан|неизвест|не привед|нет)|(?:не указан|неизвест|нет данных)[^.!?]{0,55}(?:вес|масс)/iu.test(answer);
    const claimedWeight=/\d+(?:[.,]\d+)?\s*(?:г(?:рамм[а-яё]*)?|гр\.?|кг)(?![а-яё])/iu.test(answer) &&
      !/100\s*г/iu.test(answer);
    const inventedHundred=/(?:порци[а-яё]*|вес[а-яё]*)\s*(?:составляет|весит|равен|около|примерно|—|-|это)?\s*100\s*г/iu.test(answer);
    if(claimedWeight || inventedHundred || !numbers.every(n=>allowed.includes(n)))generation.answer=null;
    else if(!noWeight)generation.answer+=' Вес одной порции в граммах в источнике не указан.';
  }
  if(action==='search' && cards.length && generation.answer) {
    // Source titles and displayed IDs must be one-to-one. Keep a short
    // conversational choice question from the model, never its recipe list.
    const question=generation.answer.split(/(?<=[.!?])\s+/u).find(sentence=>
      /\?$/u.test(sentence) && sentence.length<=160 && !/[«»"\d]/u.test(sentence) &&
      /какой.*(?:вариант|десерт|рецепт)|что.*выбер|хотите.*(?:выбрать|открыть)|какому.*предпочт/iu.test(sentence) &&
      !/аллерги|безопас|гарант/iu.test(sentence));
    generation.answer='Подобрала: '+cards.map(r=>'«'+r.title+'»').join('; ')+'. '+(question || 'Какой вариант хотите открыть?');
  }
  if(state.allergies.length && records.length && ['search','choose','calories'].includes(action)) {
    if(/безопасн|гипоаллерген|гарант|можно.*аллерги/iu.test(generation.answer || ''))generation.answer=null;
  }
  if(generatedAnswer && !generation.answer)generation.llmStatus='invalid_response';
  // Structured numbers are always rendered separately from the conversational explanation.
  return answerResult(status,generation.answer || fallback,['nutrition','clarification'].includes(action)?[]:cards,detail,nutrition,state,generation.llmStatus,action);
}
function answerResult(status,answer,recipes,recipeDetail,nutrition,context,llmStatus,action='clarification') {
  // No-match is explicit, grounded feedback with no invented recipes or cards.
  if(status==='empty')return {status,answer:'Не нашла подходящий десерт в каталоге. Попробуйте указать обычные съедобные ингредиенты или название десерта.',recipes:[],recipeDetail:null,nutrition:null,
    context:{...context,pendingAction:null},llmStatus:'not_needed',action};
  return {status,answer,recipes,recipeDetail,nutrition,context,llmStatus,action};
}
