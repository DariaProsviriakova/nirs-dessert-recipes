import {phraseKey,tokenize} from '../bm25/src/text.mjs';

export function recipeMemory(context,search) {
  const valid=values=>Array.isArray(values)?[...new Set(values.filter(id=>typeof id==='string' && search.raw(id)))]:[];
  const groups=Array.isArray(context.recipeGroups)?context.recipeGroups.map(g=>valid(g).slice(0,3)).filter(g=>g.length):[];
  const displayed=valid(context.displayedIds).slice(0,3);
  if(!groups.length && displayed.length)groups.push(displayed);
  return {knownRecipeIds:valid([...(Array.isArray(context.knownRecipeIds)?context.knownRecipeIds:[]),...groups.flat(),...displayed,context.selectedRecipeId]),recipeGroups:groups};
}
const ordinalNumber=word=>/перв/u.test(word)?0:/втор/u.test(word)?1:/трет/u.test(word)?2:/четвер/u.test(word)?3:null;
export function resolveRecipeReference(query,context,search,extra='') {
  const text=phraseKey(query),ref=phraseKey(extra);
  const memory=recipeMemory(context,search);
  const exact=memory.knownRecipeIds.map(id=>({id,title:phraseKey(search.raw(id).title)}))
    .filter(r=>(' '+text+' ').includes(' '+r.title+' ')).sort((a,b)=>b.title.length-a.title.length);
  if(exact.length) {
    const matches=exact.filter(r=>r.title.length===exact[0].title.length);
    return {id:matches.length===1?matches[0].id:null,explicit:true,candidates:matches.map(r=>r.id)};
  }
  const groupRef=text.match(/(?:из|в|из самой) (перв[а-я]*|втор[а-я]*|трет[а-я]*|предыдущ[а-я]*|последн[а-я]*) (?:подборк|выдач)/u);
  let group=memory.recipeGroups.at(-1) || context.displayedIds;
  if(groupRef) {
    const word=groupRef[1];
    const n=/предыдущ/u.test(word)?memory.recipeGroups.length-2:/последн/u.test(word)?memory.recipeGroups.length-1:ordinalNumber(word);
    group=memory.recipeGroups[n] || [];
  }
  // Remove the group ordinal before resolving the dish ordinal.
  const dishText=groupRef?text.replace(groupRef[0],' '):text;
  const ordinal=dishText.match(/(?:^| )(перв[а-я]*|втор[а-я]*|трет[а-я]*|четвер[а-я]*|последн[а-я]*)(?: |$)/u);
  if(ordinal) {
    const all=/в (?:этом )?чате|из всех|за весь чат/u.test(text);
    const ids=all?memory.knownRecipeIds:group;
    const n=/последн/u.test(ordinal[1])?ids.length-1:ordinalNumber(ordinal[1]);
    return {id:ids[n] || null,explicit:true,candidates:[]};
  }
  if(/предыдущ[а-я]* (?:рецепт|блюд|десерт)/u.test(text)) {
    const n=memory.knownRecipeIds.indexOf(context.selectedRecipeId);
    return {id:memory.knownRecipeIds[n-1] || null,explicit:true,candidates:[]};
  }
  const queryTokens=new Set(tokenize(text));
  const stop=new Set(tokenize('рецепт десерт блюдо сколько приготовление приготовить готовить время калории молоко сахар'));
  const ranked=memory.knownRecipeIds.map(id=>{
    const title=phraseKey(search.raw(id).title),tokens=tokenize(title);
    const full=text.includes(title) || (ref.length>=4 && title.includes(ref));
    const terms=tokens.filter(t=>!stop.has(t));
    const overlap=terms.filter(t=>queryTokens.has(t)).length;
    return {id,full,score:full?1000+tokens.length:overlap,match:full || (terms.length && overlap>=1)};
  }).filter(r=>r.match).sort((a,b)=>b.score-a.score);
  if(ranked.length) {
    const matches=ranked.filter(r=>r.score===ranked[0].score);
    return {id:matches.length===1?matches[0].id:null,explicit:true,candidates:matches.map(r=>r.id)};
  }
  return {id:context.selectedRecipeId || (context.displayedIds.length===1?context.displayedIds[0]:null),explicit:false,candidates:[]};
}
export function rememberRecipes(state,ids,{group=false}={}) {
  state.knownRecipeIds=[...new Set([...state.knownRecipeIds,...ids])];
  if(group && ids.length && JSON.stringify(state.recipeGroups.at(-1))!==JSON.stringify(ids))
    state.recipeGroups=[...state.recipeGroups,[...ids]];
}
