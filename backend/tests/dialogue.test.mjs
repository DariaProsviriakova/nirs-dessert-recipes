import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSearch } from '../search.mjs';
import { buildBm25Index } from '../../bm25/src/bm25.mjs';
import { converse } from '../dialogue.mjs';
import { ingredientMatches,ingredientExcluded,scaleAmount,presentRecipe } from '../recipe-data.mjs';

const record=(id,title,names,kcal,servings=4)=>({
 id,title,description:title,categories:['Десерты'],rootCategory:'Десерты',aliases:[],steps:['Смешайте ингредиенты и охладите.'],
 ingredientNames:names,ingredients:names.map((name,i)=>({name,amount:i===0?'2 шт':'100 г'})),servings,timeMinutes:20,
 nutrition:{per100g:{kcal,protein:3,fats:2,carbs:15},wholeDish:{kcal:800,protein:12,fats:8,carbs:60}},
});
const milkA=record('a','Банановый десерт с молоком',['Банан','Молоко','Сахар'],170);
const milkB=record('b','Банановый крем',['Банан','Молоко','Желатин'],90);
const plain=record('c','Банановый десерт без молока',['Банан','Овсяные хлопья'],140);
const nuts=record('d','Ореховый пирог',['Мука пшеничная','Орехи грецкие','Молоко'],260);
const condensed=record('e','Банан со сгущёнкой',['Банан','Молоко сгущенное'],300);
const search=makeSearch(buildBm25Index([milkA,milkB,plain,nuts,condensed]));
const llm={configured:false};
const turn=(query,context)=>converse({query,context,search,llm});
test('every requested ingredient appears in each recommended card',async()=>{
 const result=await turn('У меня есть банан и молоко. Что можно приготовить?');
 assert.equal(result.status,'found');
 assert.deepEqual(new Set(result.recipes.map(r=>r.id)),new Set(['a','b']));
 assert(result.recipes.every(r=>r.matchedIngredients.length===2));
 assert(result.recipes.every(r=>r.ingredients.some(i=>i.includes('Банан')) && r.ingredients.some(i=>i.includes('Молоко'))));
 const three=await turn('есть мука и орехи и молоко');
 assert.deepEqual(three.recipes.map(r=>r.id),['d']);
});
test('calorie follow-up keeps context and orders shown recipes on the same basis',async()=>{
 const first=await turn('У меня есть банан и молоко');
 const next=await turn('где меньше калорий',first.context);
 assert.equal(next.action,'calories');
 assert.equal(next.recipes[0].id,'b');
 assert.equal(next.recipes[1].id,'a');
 assert.deepEqual(next.context.ingredients,['банан','молоко']);
});
test('selection followed by nutrition returns the selected source values',async()=>{
 const first=await turn('есть банан и молоко');
 const chosen=await turn('первый',first.context);
 assert.equal(chosen.status,'exact');
 assert(chosen.recipeDetail);
 const nutrition=await turn('покажи его КБЖУ',chosen.context);
 assert.equal(nutrition.nutrition.recipeId,chosen.recipeDetail.id);
 assert.equal(nutrition.nutrition.basis,'per100g');
 assert.equal(nutrition.nutrition.values.kcal,search.raw(chosen.recipeDetail.id).nutrition.per100g.kcal);
 const ambiguous=await turn('покажи КБЖУ',first.context);
 assert.equal(ambiguous.status,'clarification');
});
test('six-person follow-up scales quantities and preserves nutrition per 100g',async()=>{
 const context={version:2,ingredients:['банан','молоко'],displayedIds:['a','b'],selectedRecipeId:'a',filters:{}};
 const result=await turn('на 6 человек',context);
 assert.equal(result.action,'servings');
 assert.equal(result.recipes[0].servings,6);
 assert.equal(result.recipes[0].originalServings,4);
 assert.equal(result.recipes[0].ingredientEntries[0].amount,'3 шт');
 assert.equal(result.recipes[0].ingredientEntries[1].amount,'150 г');
 assert.equal(result.recipes[0].nutrition.per100g.kcal,170);
 assert.equal(result.recipes[0].nutrition.wholeDish.kcal,1200);
 const macro=await turn('а на всё блюдо КБЖУ',result.context);
 assert.equal(macro.nutrition.values.kcal,1200);
});
test('without-milk follow-up removes the old required milk and searches alternatives',async()=>{
 const first=await turn('есть банан и молоко');
 const next=await turn('а без молока',first.context);
 assert.deepEqual(next.context.ingredients,['банан']);
 assert(next.context.excludedIngredients.includes('молоко'));
 assert(next.recipes.length);
 assert(next.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('молоко',i.name))));
});
test('missing source portions/nutrition are not invented',async()=>{
 const unknown=record('unknown','Банановый десерт',['Банан'],100,null);unknown.nutrition=null;
 const engine=makeSearch(buildBm25Index([unknown]));
 const context={displayedIds:['unknown'],selectedRecipeId:'unknown',ingredients:['банан']};
 const result=await converse({query:'на 6 человек',context,search:engine,llm});
 assert.equal(result.status,'clarification');assert.equal(result.recipes[0].servings,null);
 const macros=await converse({query:'КБЖУ',context,search:engine,llm});
 assert.equal(macros.nutrition.values,null);
});
test('fractional quantities, source missing units and milk derivatives are handled explicitly',()=>{
 assert.equal(scaleAmount('1/2 стак.',1.5),'0,75 стак.');
 assert.equal(scaleAmount('1 1/2 ч. л.',2),'3 ч. л.');
 assert.equal(scaleAmount('по вкусу',3),'по вкусу');
 assert.equal(ingredientMatches('молоко','Молоко сгущенное'),false);
 assert.equal(ingredientMatches('орехи','Миндаль'),true);
 assert.equal(presentRecipe(milkA,{servings:6}).servings,6);
});
test('context is per-request and a new chat does not inherit another chat',async()=>{
 const old=await turn('есть банан и молоко');
 const fresh=await turn('на 6 человек');
 assert.equal(fresh.status,'clarification');
 assert.equal(fresh.context.ingredients.length,0);
 assert.equal(old.context.ingredients.length,2);
});

test('a nutrition-basis clarification resumes the pending calorie filter',async()=>{
 const first=await turn('банан до 200 ккал');
 assert.equal(first.status,'clarification');
 const second=await turn('на 100 г',first.context);
 assert.equal(second.context.filters.nutritionBasis,'per100g');
 assert.equal(second.context.filters.nutrition.kcal.max,200);
 assert(second.recipes.every(r=>r.nutrition.per100g.kcal<=200));
});
test('nutrition for an unambiguous dish name can be requested without opening a card',async()=>{
 const result=await turn('КБЖУ Банановый крем');
 assert.equal(result.nutrition.recipeId,'b');
 assert.equal(result.nutrition.values.kcal,90);
});

test('a fresh explicit pantry list replaces conflicting old exclusions',async()=>{
 const old={ingredients:['банан'],excludedIngredients:['молоко'],displayedIds:['c'],selectedRecipeId:'c'};
 const result=await turn('У меня есть мука и орехи и молоко',old);
 assert.deepEqual(result.context.ingredients,['мука','орехи','молоко']);
 assert.deepEqual(result.context.excludedIngredients,[]);
 assert(result.recipes.every(r=>r.matchedIngredients.length===3));
});
test('an unknown pantry item is not silently ignored',async()=>{
 const result=await turn('у меня есть банан и дуриан');
 assert(result.context.ingredients.includes('дуриан'));
 assert.equal(result.status,'empty');
});

test('numeric answers never use contradictory LLM prose',async()=>{
 const wrong={reply:async()=>({answer:'Самый лёгкий десерт содержит 999 ккал, после пересчёта на порцию 117 ккал.',llmStatus:'ok'})};
 const context={ingredients:['банан','молоко'],displayedIds:['a','b'],selectedRecipeId:'a'};
 const calorie=await converse({query:'где меньше калорий',context,search,llm:wrong});
 assert(calorie.answer.includes('Банановый крем'));
 assert(calorie.answer.includes('90 ккал'));
 assert(!calorie.answer.includes('999'));
 const serving=await converse({query:'на 6 человек',context,search,llm:wrong});
 assert(serving.answer.includes('с 4 на 6'));
 assert(serving.answer.includes('3 шт'));
 assert(!serving.answer.includes('117'));
 const macro=await converse({query:'КБЖУ на 100 г',context,search,llm:wrong});
 assert(macro.answer.includes('170 ккал'));
 assert(!macro.answer.includes('999'));
});
test('milk exclusion after nutrition works even when intent LLM incorrectly returns nutrition',async()=>{
 const context={ingredients:['банан','молоко'],displayedIds:['a','b'],selectedRecipeId:'a'};
 const result=await converse({query:'а без молока',context,search,llm:{
  interpret:async()=>({action:'nutrition'}),reply:async()=>({answer:null,llmStatus:'not_configured'})
 }});
 assert.equal(result.action,'search');
 assert(result.recipes.length);
 assert(result.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('молоко',i.name))));
});

test('an explicit unique source title still opens the full recipe',async()=>{
 const result=await turn('Банановый крем');
 assert.equal(result.action,'choose');
 assert.equal(result.recipeDetail.id,'b');
 assert.equal(result.status,'exact');
});

test('free-form recipe suggestions cannot append invented numeric nutrition',async()=>{
 const result=await converse({query:'есть банан и молоко',search,llm:{
  reply:async()=>({answer:'Предлагаю банановый крем. В одной порции примерно 999 ккал.',llmStatus:'ok'})
 }});
 assert(result.recipes.every(r=>result.answer.includes(r.title)));
 assert(!result.answer.includes('999'));
});

test('a calorie question is a separate answer, never a keyword recipe search',async()=>{
 const first=await turn('есть банан и молоко');
 let calls=0;
 const engine={...search,find:(...args)=>{calls++;return search.find(...args)}};
 const result=await converse({query:'сколько калорий?',context:first.context,search:engine,llm});
 assert.equal(result.status,'clarification');
 assert.deepEqual(result.recipes,[]);
 assert.equal(calls,0);
 assert.deepEqual(result.context.displayedIds,first.context.displayedIds);
 const answer=await turn('у первого',result.context);
 assert.equal(answer.action,'nutrition');
 assert.equal(answer.nutrition.recipeId,first.context.displayedIds[0]);
 assert.deepEqual(answer.recipes,[]);
});
test('random typing does not repeat the previous comparison or mutate preferences',async()=>{
 const first=await turn('есть банан и молоко');
 const compared=await turn('где меньше калорий',first.context);
 const result=await converse({query:'kugfthhkj',context:compared.context,search,llm:{
  interpret:async()=>({action:'calories'}),reply:async()=>({answer:'повтор',llmStatus:'ok'})
 }});
 assert.equal(result.status,'clarification');
 assert.deepEqual(result.recipes,[]);
 assert.deepEqual(result.context,compared.context);
});

test('a new explicit request cancels an old nutrition clarification',async()=>{
 const first=await turn('есть банан и молоко');
 const pending=await turn('сколько калорий?',first.context);
 const fresh=await turn('есть мука и орехи и молоко',pending.context);
 assert.equal(fresh.context.pendingNutritionRequest,null);
 const choice=await turn('первый',fresh.context);
 assert.equal(choice.action,'choose');
 assert(choice.recipeDetail);
});

test('portion size is a contextual discussion with source count and unknown mass',async()=>{
 const context={ingredients:['банан','молоко'],displayedIds:['a','b'],selectedRecipeId:'a'};
 let payload;
 const model={reply:async(query,state,history,result)=>{
   payload=result;
   return {answer:'Для этого десерта указано 4 порции. Вес порции в граммах неизвестен. Взвесьте готовый десерт и разделите на 4.',llmStatus:'ok'};
 }};
 for(const query of ['насколько большая порция?','порции']) {
   const result=await converse({query,context,search,llm:model});
   assert.equal(result.action,'discuss');
   assert.equal(result.status,'found');
   assert.equal(result.llmStatus,'ok');
   assert.deepEqual(result.recipes,[]);
   assert.equal(result.recipeDetail,null);
   assert.equal(result.context.selectedRecipeId,'a');
   assert.equal(payload.discussion.recipe.servings,4);
   assert.equal(payload.discussion.portionWeightGrams,null);
   assert.equal(result.answer,'Для этого десерта указано 4 порции. Вес порции в граммах неизвестен. Взвесьте готовый десерт и разделите на 4.');
 }
});
test('unknown mass is never invented even if the model treats 100g nutrition as a portion',async()=>{
 const context={displayedIds:['a'],selectedRecipeId:'a'};
 for(const answer of ['Одна порция весит 200 г.','Вес порции 100 г, точный вес неизвестен.']) {
  const result=await converse({query:'насколько большая порция?',context,search,llm:{
   reply:async()=>({answer,llmStatus:'ok'})
  }});
  assert(result.answer.includes('Вес одной порции в граммах не указан'));
  assert(!result.answer.includes('200 г'));
  assert(!result.answer.includes('Вес порции 100 г'));
 }
});
test('portion question asks for the dish and resumes after selecting the second',async()=>{
 const first=await turn('есть банан и молоко');
 const question=await turn('порции',first.context);
 assert.equal(question.status,'clarification');
 assert.deepEqual(question.recipes,[]);
 assert.equal(question.context.pendingRecipeQuestion,'порции');
 const next=await turn('у второго',question.context);
 assert.equal(next.action,'discuss');
 assert.equal(next.context.selectedRecipeId,first.context.displayedIds[1]);
 assert.equal(next.context.pendingRecipeQuestion,null);
 assert(next.answer.includes('порций'));
});
test('missing serving count and open recipe questions produce answers without another search',async()=>{
 const unknown=record('unknown','Банановый десерт',['Банан'],100,null);
 const engine=makeSearch(buildBm25Index([unknown]));
 const context={displayedIds:['unknown'],selectedRecipeId:'unknown'};
 const result=await converse({query:'порции',context,search:engine,llm});
 assert(result.answer.includes('число порций в источнике не указано'));
 let facts;
 const response=await converse({query:'почему нужно охлаждать?',context,search:engine,llm:{
  reply:async(q,c,h,r)=>{facts=r.discussion;return {answer:'В шагах сказано смешать ингредиенты и охладить. Причину охлаждения источник не объясняет.',llmStatus:'ok'};}
 }});
 assert.equal(response.action,'discuss');
 assert.deepEqual(response.recipes,[]);
 assert.deepEqual(facts.recipe.steps,unknown.steps);
});

test('missing source steps cannot turn a user assumption into a required cooking step',async()=>{
 const unknown=record('unknown','Банановый десерт',['Банан'],100,4);unknown.steps=[];
 const engine=makeSearch(buildBm25Index([unknown]));
 const result=await converse({query:'почему нужно охлаждать?',context:{displayedIds:['unknown'],selectedRecipeId:'unknown'},search:engine,llm:{
  reply:async()=>({answer:'Охлаждение обязательно, чтобы десерт не разваливался.',llmStatus:'ok'})
 }});
 assert(result.answer.includes('нет шагов приготовления'));
 assert(!result.answer.includes('Охлаждение обязательно'));
 assert.deepEqual(result.recipes,[]);
});

test('time questions use the selected dish or another dish in its recommendation group',async()=>{
 const first=await turn('есть банан и молоко');
 const chosen=await turn('первый',first.context);
 const time=await turn('сколько по времени готовит',chosen.context);
 assert.equal(time.action,'discuss');assert.equal(time.status,'found');
 assert(time.answer.includes('20 мин'));
 assert.deepEqual(time.recipes,[]);
 const second=await turn('приготовление второго блюда сколько по времени занимает',time.context);
 assert.equal(second.context.selectedRecipeId,first.recipes[1].id);
 assert(second.answer.includes(first.recipes[1].title));
});
test('all dishes and groups remain addressable after another search and unrelated turns',async()=>{
 const first=await turn('есть банан и молоко');
 const other=await turn('есть мука и орехи и молоко',first.context);
 assert(first.recipes.every(r=>other.context.knownRecipeIds.includes(r.id)));
 assert(other.context.knownRecipeIds.includes('d'));
 let context=other.context;
 for(let i=0;i<8;i++)context=(await turn('спасибо',context)).context;
 const old=await turn('сколько времени готовить '+first.recipes[1].title,context);
 assert.equal(old.context.selectedRecipeId,first.recipes[1].id);
 assert(old.answer.includes('20 мин'));
 const numbered=await turn('сколько по времени занимает второе блюдо из первой подборки',old.context);
 assert.equal(numbered.context.selectedRecipeId,first.recipes[1].id);
 assert.deepEqual(numbered.recipes,[]);
 const macro=await turn('КБЖУ '+first.recipes[0].title,numbered.context);
 assert.equal(macro.nutrition.recipeId,first.recipes[0].id);
 const fresh=await turn('сколько по времени готовит');
 assert.equal(fresh.status,'clarification');
 assert.deepEqual(fresh.context.knownRecipeIds,[]);
});
test('unknown time and an invalid reference are not replaced with invented values or the selected dish',async()=>{
 const unknown=record('unknown','Банановый десерт',['Банан'],100,4);unknown.timeMinutes=null;
 const engine=makeSearch(buildBm25Index([unknown]));
 const context={displayedIds:['unknown'],selectedRecipeId:'unknown'};
 const result=await converse({query:'сколько времени готовить?',context,search:engine,llm:{
  reply:async()=>({answer:'Готовить 90 минут.',llmStatus:'ok'})
 }});
 assert(result.answer.includes('не указано время'));
 assert(!result.answer.includes('90'));
 const invalid=await converse({query:'сколько времени готовить второе блюдо?',context,search:engine,llm});
 assert.equal(invalid.status,'clarification');
 assert.deepEqual(invalid.recipes,[]);
});

test('a pending time question accepts a dish title instead of opening another recipe',async()=>{
 const first=await turn('есть банан и молоко');
 const question=await turn('сколько по времени готовит',first.context);
 assert.equal(question.status,'clarification');
 const answer=await turn(first.recipes[1].title,question.context);
 assert.equal(answer.action,'discuss');
 assert(answer.answer.includes('20 мин'));
 assert.equal(answer.context.selectedRecipeId,first.recipes[1].id);
 assert.equal(answer.recipeDetail,null);
});
test('time explanation cannot assert that waiting is excluded from source duration',async()=>{
 const result=await converse({query:'сколько времени готовить?',context:{displayedIds:['a'],selectedRecipeId:'a'},search,llm:{
  reply:async()=>({answer:'Готовить 20 минут, дополнительное ожидание не учитывается.',llmStatus:'ok'})
 }});
 assert(result.answer.includes('20 мин'));
 assert(!result.answer.includes('не учитывается'));
});
test('a new search cannot falsely say the user has chosen a dish from old history',async()=>{
 const result=await converse({query:'есть мука и орехи и молоко',search,llm:{
  reply:async()=>({answer:'Вы выбрали ореховый пирог.',llmStatus:'ok'})
 }});
 assert(!result.answer.includes('Вы выбрали'));
 assert.equal(result.context.selectedRecipeId,null);
 assert(result.recipes.length);
});

test('allergy immediately finds alternatives; confirmation of a legacy offer still preserves exclusions',async()=>{
 const first=await turn('есть мука и орехи и молоко');
 const excluded=await turn('у меня аллергия на орехи, предложи что то без них',first.context);
 assert.equal(excluded.action,'search');
 assert.deepEqual(excluded.context.allergies,['орехи']);
 assert(!excluded.context.ingredients.some(x=>/орех|аллерги|предлож/iu.test(x)));
 assert(excluded.context.excludedIngredients.includes('орехи'));
 assert.equal(excluded.status,'found');assert(excluded.recipes.length);assert.equal(excluded.context.pendingAction,null);
 const yes=await turn('да',{...excluded.context,pendingAction:{type:'broaden_search'}});
 assert.equal(yes.action,'search');assert.equal(yes.status,'found');
 assert(yes.recipes.length);
 assert(yes.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('орехи',i.name))));
 const again=await turn('рецепт без орехов',yes.context);
 assert(again.recipes.length);
 assert(again.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('орехи',i.name))));
});
test('allergy survives a fresh pantry and cannot be removed by intent model output',async()=>{
 const first=await turn('у меня аллергия на орехи');
 const fresh=await turn('есть банан и молоко',first.context);
 assert(fresh.context.allergies.includes('орехи'));
 assert(fresh.context.excludedIngredients.includes('орехи'));
 const next=await converse({query:'еще варианты',context:fresh.context,search,llm:{
  interpret:async()=>({action:'search',ingredients:['банан','молоко','орехи'],excludedIngredients:[]}),
  reply:async()=>({answer:'Гарантированно безопасно при аллергии.',llmStatus:'ok'})
 }});
 assert(next.context.excludedIngredients.includes('орехи'));
 assert(!next.context.ingredients.includes('орехи'));
 assert(!next.answer.includes('Гарантированно безопасно'));
 assert(next.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('орехи',i.name))));
});
test('legacy yes recovers allergy restriction from recent conversation instead of rejecting the answer',async()=>{
 const result=await converse({query:'да',context:{ingredients:['орехи','предложи что то без них'],topic:'орехи'},
  history:[
   {role:'user',text:'у меня аллергия на орехи, предложи что то без них'},
   {role:'assistant',text:'К сожалению, среди найденных рецептов нет подходящих для тебя. Могу предложить убрать орехи из рассмотрения?'},
  ],search,llm});
 assert.equal(result.action,'search');
 assert(result.recipes.length);
 assert(result.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('орехи',i.name))));
});
test('declining a concrete offer preserves restrictions without starting a new search',async()=>{
 const pending=await turn('есть банан и дуриан');
 assert.equal(pending.answer,'');assert.equal(pending.context.pendingAction,null);
 const no=await turn('нет',{...pending.context,pendingAction:{type:'broaden_search'}});
 assert.equal(no.context.pendingAction,null);
 assert.deepEqual(no.context.ingredients,pending.context.ingredients);
 assert.deepEqual(no.recipes,[]);
});


test('berry preference, more variants, clarification and reload keep the real search topic',async()=>{
 const berries=[
  ...Array.from({length:5},(_,i)=>record('berry'+i,'Ягодный десерт '+i,['Клубника','Молоко'],100+i)),
  record('raspberry','Малиновое суфле',['Малина'],150),
  record('unrelated','Шоколадный мусс',['Шоколад'],200),
 ];
 const engine=makeSearch(buildBm25Index(berries));
 const misleading={interpret:async()=>({action:'chat'}),reply:async()=>({answer:null,llmStatus:'unavailable'})};
 const next=(query,context)=>converse({query,context,search:engine,llm:misleading});
 const greeting=await next('привет');
 assert.equal(greeting.recipes.length,0);
 const first=await next('хочу что-то ягодное',greeting.context);
 assert.equal(first.action,'search');assert.equal(first.recipes.length,3);
 assert(first.recipes.every(r=>r.ingredientEntries.some(i=>ingredientMatches('ягоды',i.name))));
 const second=await next('ещё',JSON.parse(JSON.stringify(first.context)));
 assert.equal(second.action,'search');assert.equal(second.recipes.length,3);
 assert(second.recipes.every(r=>!first.recipes.some(old=>old.id===r.id)));
 const end=await next('еще',second.context);
 assert.equal(end.status,'empty');assert.equal(end.recipes.length,0);
 assert.equal(end.answer,'');assert.equal(end.context.pendingAction,null);
 const strawberry=await next('клубника',second.context);
 assert.deepEqual(strawberry.context.ingredients,['клубника']);
 assert(strawberry.recipes.length);
 assert(strawberry.recipes.every(r=>r.matchedIngredients.includes('клубника')));
 const reset=await next('ещё');
 assert.equal(reset.status,'clarification');assert.equal(reset.recipes.length,0);
});
test('retrieval filters apply before nutrition intent, reject unknown values and normalize hour phrases',async()=>{
 const quick=record('quick','Банановый десерт быстрый',['Банан'],80);quick.timeMinutes=20;
 const slow=record('slow','Банановый десерт долгий',['Банан'],180);slow.timeMinutes=90;
 const unknown=record('missing','Банановый десерт неизвестный',['Банан'],null);unknown.timeMinutes=null;unknown.servings=null;
 const anomaly=record('anomaly','Банановый десерт с ошибкой',['Банан'],70);anomaly.timeMinutes=2000;anomaly.timeAnomaly=true;
 const engine=makeSearch(buildBm25Index([quick,slow,unknown,anomaly]));
 for(const query of ['банан до 30 минут','банан не дольше часа','банан до одного часа']) {
  const result=await converse({query,search:engine,llm});
  assert.equal(result.action,'search');assert.deepEqual(result.recipes.map(r=>r.id),['quick']);
 }
 const low=await converse({query:'банан до 100 ккал на 100 г',search:engine,llm});
 assert.equal(low.action,'search');assert(low.recipes.length);
 assert(low.recipes.every(r=>r.nutrition.per100g.kcal<=100));
 assert(!low.recipes.some(r=>r.id==='missing'));
 assert.deepEqual(engine.find({ingredients:['банан'],filters:{minTimeMinutes:30,maxTimeMinutes:120,minServings:4,maxServings:4}}).map(r=>r.id),['slow']);
});
test('dish category exclusions do not leak through titles and a single current dish needs no redundant clarification',async()=>{
 const engine=makeSearch(buildBm25Index([
  record('cake','Шоколадный торт',['Шоколад'],200),
  record('mousse','Шоколадный мусс',['Шоколад'],100),
 ]));
 const first=await converse({query:'есть шоколад',search:engine,llm});
 const next=await converse({query:'не хочу торт',context:first.context,search:engine,llm});
 assert.deepEqual(next.recipes.map(r=>r.id),['mousse']);
 const macro=await converse({query:'сколько калорий?',context:next.context,search:engine,llm});
 assert.equal(macro.nutrition.recipeId,'mousse');assert.equal(macro.recipes.length,0);
 const time=await converse({query:'сколько времени готовить?',context:next.context,search:engine,llm});
 assert.equal(time.action,'discuss');assert.match(time.answer,/20 мин/);
});


test('a suggestion turn cannot invent preparation instructions, time uses source without generation',async()=>{
 const result=await converse({query:'есть банан и молоко',search,llm:{
  reply:async()=>({answer:'Предлагаю банановый крем. Добавьте клубнику и растопите белый шоколад.',llmStatus:'ok'})
 }});
 assert(!result.answer.includes('клубнику'));assert(!result.answer.includes('белый шоколад'));
 assert.equal(result.llmStatus,'invalid_response');assert(result.recipes.length);
 const time=await converse({query:'сколько времени готовить?',context:{selectedRecipeId:'a',displayedIds:['a']},search,llm:{
  reply:async()=>{throw new Error('Numeric source time must not need generation');}
 }});
 assert.equal(time.llmStatus,'not_needed');assert.match(time.answer,/20 мин/);
});


test('no-match response is blank and never calls the model or invents a broader-search offer',async()=>{
 const result=await converse({query:'у меня есть банан и дуриан',context:{
  ingredients:['банан'],allergies:['орехи'],excludedIngredients:['орехи'],displayedIds:['a','b'],
  knownRecipeIds:['a','b'],recipeGroups:[['a','b']],
 },search,llm:{reply:async()=>{throw new Error('No generation for empty results');}}});
 assert.equal(result.status,'empty');assert.equal(result.answer,'');
 assert.deepEqual(result.recipes,[]);assert.equal(result.recipeDetail,null);assert.equal(result.nutrition,null);
 assert.equal(result.context.pendingAction,null);assert.equal(result.llmStatus,'not_needed');
 assert.deepEqual(result.context.ingredients,['банан','дуриан']);
 assert(result.context.allergies.includes('орехи'));
 assert.deepEqual(result.context.knownRecipeIds,['a','b']);
});


test('calorie questions in either word order show nutrition of the current dish, never comparison cards',async()=>{
 const context={ingredients:['банан','молоко'],displayedIds:['a','b'],selectedRecipeId:'b'};
 const wrong={interpret:async()=>({action:'calories'}),reply:async()=>{throw new Error('Source nutrition needs no generation');}};
 for(const query of ['а калорий сколько','калорий сколько у него?','а калории?','сколько ккал','КБЖУ']) {
  const result=await converse({query,context,search,llm:wrong});
  assert.equal(result.action,'nutrition');assert.equal(result.nutrition.recipeId,'b');
  assert.equal(result.nutrition.values.kcal,90);assert.deepEqual(result.recipes,[]);
 }
 const question=await converse({query:'а калорий сколько',context:{displayedIds:['a','b']},search,llm:wrong});
 assert.equal(question.status,'clarification');assert.deepEqual(question.recipes,[]);
 const comparison=await turn('а где калорий меньше',context);
 assert.equal(comparison.action,'calories');assert.equal(comparison.recipes[0].id,'b');
});
test('bare and reversed pantry phrases replace a failed inventory but preserve allergies',async()=>{
 const failed=await turn('у меня есть дуриан',{allergies:['орехи'],excludedIngredients:['орехи']});
 assert.equal(failed.status,'empty');
 for(const query of ['банан','банан есть','банан есть у меня','есть банан','у меня есть банан','у меня есть бана','банан и молоко','молоко, банан']) {
  const result=await turn(query,failed.context);
  assert.equal(result.action,'search',query);assert.equal(result.status,'found',query);
  assert(result.recipes.length,query);
  assert(!result.context.ingredients.includes('дуриан'),query);
  assert(result.recipes.every(r=>r.matchedIngredients.length===result.context.ingredients.length),query);
  assert(result.context.allergies.includes('орехи'),query);
 }
 const added=await turn('добавь молоко',{ingredients:['банан'],topic:'банан'});
 assert.deepEqual(added.context.ingredients,['банан','молоко']);
});


test('bare ingredients are recognized from the source catalog beyond the hand-written common-food list',async()=>{
 const engine=makeSearch(buildBm25Index([
  record('apricot','Абрикосовый десерт',['Абрикос','Кунжут'],150),
 ]));
 for(const query of ['абрикос','кунжут','абрикос и кунжут','абрикос, кунжут','абрикос есть']) {
  const result=await converse({query,context:{ingredients:['дуриан'],topic:'дуриан'},search:engine,llm});
  assert.equal(result.status,'found',query);assert.deepEqual(result.recipes.map(r=>r.id),['apricot'],query);
  assert(!result.context.ingredients.includes('дуриан'),query);
 }
});


test('combined exclusions and serving count search alternatives before scaling any prior recipe',async()=>{
 const engine=makeSearch(buildBm25Index([
  record('banana1','Банановый крем',['Банан','Молоко'],90),
  record('banana2','Жареный банан',['Банан','Сахар'],150),
  record('berry','Ягодное суфле',['Клубника','Молоко'],120),
  record('chocolate','Шоколадный мусс',['Шоколад'],180),
 ]));
 const model={interpret:async()=>({action:'servings'}),reply:async()=>({answer:null,llmStatus:'not_configured'})};
 const next=(query,context)=>converse({query,context,search:engine,llm:model});
 for(const chooseFirst of [false,true]) {
  const initial=await next('у меня есть банан');
  const selected=chooseFirst?await next('первый',initial.context):initial;
  for(const query of ['не бананы, что то на 10 человек','блюдо на 10 человек без бананов','без бананов на десять человек']) {
   const result=await next(query,selected.context);
   assert.equal(result.action,'search',query);assert.equal(result.status,'found',query);
   assert(result.recipes.length,query);
   assert(result.context.excludedIngredients.includes('банан'),query);
   assert(!result.context.ingredients.includes('банан'),query);
   assert(result.recipes.every(r=>r.servings===10),query);
   assert(result.recipes.every(r=>!r.ingredientEntries.some(i=>ingredientExcluded('банан',i.name))),query);
  }
 }
 const initial=await next('есть банан');
 const first=await next('не бананы, что то на 10 человек',initial.context);
 const repeated=await next('блюдо на 10 человек без бананов',first.context);
 assert(repeated.recipes.every(r=>r.servings===10 && !r.ingredientEntries.some(i=>ingredientExcluded('банан',i.name))));
 const pantry=await next('есть клубника на 10 человек',initial.context);
 assert.equal(pantry.action,'search');assert.deepEqual(pantry.recipes.map(r=>r.id),['berry']);
 assert.equal(pantry.recipes[0].servings,10);
 const unchanged=await next('не больше 100 ккал на 100 г с бананом');
 assert(!unchanged.context.excludedIngredients.includes('банан'));
});


test('durian, an allergy declaration, and a new pie request do not leave a failed ingredient stuck in the search',async()=>{
 const engine=makeSearch(buildBm25Index([
  record('pie','Яблочный пирог',['Яблоко','Мука'],120),
  record('nuts','Ореховый пирог',['Орехи грецкие','Мука'],200),
  record('pudding','Яблочный пудинг',['Яблоко'],100),
 ]));
 const next=(query,context)=>converse({query,context,search:engine,llm:{interpret:async()=>({action:'chat'})}});
 const empty=await next('дуриан есть');
 assert.equal(empty.status,'empty');assert.equal(empty.answer,'');
 const allergy=await next('аллергия на орехи',empty.context);
 assert.equal(allergy.action,'search');assert(allergy.recipes.length);assert(!allergy.answer.includes('Учту исключение'));
 const pie=await next('хочу пирог',allergy.context);
 assert.equal(pie.status,'found');assert.deepEqual(pie.context.ingredients,[]);
 assert(pie.context.allergies.includes('орехи'));assert.deepEqual(pie.recipes.map(r=>r.id),['pie']);
});
test('sugar exclusion rejects named sugar and common sugary compound ingredients without promising safety',async()=>{
 for(const name of ['Сахар','Сахарная пудра','Молоко сгущенное','Сгущенка','Джем','Шоколад молочный'])assert(ingredientExcluded('сахар',name),name);
 assert(!ingredientExcluded('сахар','Молоко'));
 const engine=makeSearch(buildBm25Index([
  record('condensed','Молочный пудинг',['Молоко','Яйцо','Молоко сгущенное'],200),
  record('plain','Молочное суфле',['Молоко','Яйцо','Агар-агар'],100),
 ]));
 const first=await converse({query:'у меня есть молоко и яйца',search:engine,llm});
 const allergy=await converse({query:'у меня аллергия на сахар',context:first.context,search:engine,llm});
 assert.equal(allergy.action,'search');assert(allergy.context.allergies.includes('сахар'));
 const next=await converse({query:'подбери без сахара',context:allergy.context,search:engine,llm});
 assert.deepEqual(next.recipes.map(r=>r.id),['plain']);
 assert(!/безопасно|гарантирован/iu.test(next.answer));
});
test('suggestion text names exactly the displayed source recipes rather than a model-invented list',async()=>{
 const result=await converse({query:'есть банан и молоко',search,llm:{
  reply:async()=>({answer:'Выбирайте между тортом «Три молока» и чизкейком. Какой вариант вам ближе?',llmStatus:'ok'})
 }});
 assert(result.recipes.every(r=>result.answer.includes(r.title)));
 assert(!result.answer.includes('Три молока'));assert(!result.answer.includes('чизкейком'));
});


test('a plain nut allergy request immediately returns three matching recipes without a separate acknowledgement',async()=>{
 const engine=makeSearch(buildBm25Index([
  ...Array.from({length:3},(_,i)=>record('plain'+i,'Ягодный десерт '+i,['Клубника'],100+i)),
  record('nuts','Ореховый десерт',['Миндаль'],200),
 ]));
 for(const context of [undefined,{ingredients:['дуриан'],topic:'дуриан'},{ingredients:['клубника'],topic:'клубника'}]) {
  const result=await converse({query:'аллергия на орехи',context,search:engine,llm});
  assert.equal(result.action,'search');assert.equal(result.recipes.length,3);
  assert(result.recipes.every(r=>r.ingredientEntries.every(i=>!ingredientExcluded('орехи',i.name))));
  assert(!/Учту исключение|следы аллергенов|сохранено для следующих/u.test(result.answer));
 }
});


test('ingredient refinements require the new product even when unknown, without replaying old cards',async()=>{
 const engine=makeSearch(buildBm25Index([
  record('apricot','Абрикосовый пирог',['Абрикос','Мука'],140),
  record('banana','Банановый пирог',['Банан','Мука'],160),
  record('other','Абрикосовый пудинг',['Абрикос'],100),
 ]));
 const wrong={interpret:async()=>({action:'search',ingredients:['абрикос'],topic:'абрикос'})};
 const next=(query,context)=>converse({query,context,search:engine,llm:wrong});
 const initial=await next('с абрикосами',{excludedIngredients:['орехи'],allergies:['орехи']});
 assert(initial.recipes.length);
 for(const query of ['с дурианом','а с дурианом','из дуриана','хочу пирог с дурианом']) {
  const result=await next(query,initial.context);
  assert.equal(result.status,'empty',query);assert.equal(result.answer,'',query);
  assert.deepEqual(result.recipes,[],query);assert(!result.context.ingredients.includes('абрикос'),query);
  assert(result.context.ingredients.some(i=>/дуриан/u.test(i)),query);
  assert(result.context.allergies.includes('орехи'),query);
 }
 const pie=await next('хочу пирог');
 const refined=await next('с абрикосами',pie.context);
 assert.equal(refined.context.topic,'пирог');assert.deepEqual(refined.recipes.map(r=>r.id),['apricot']);
 const recovered=await next('с бананом',(await next('с дурианом',refined.context)).context);
 assert.deepEqual(recovered.recipes.map(r=>r.id),['banana']);
 const question=await converse({query:'из чего состоит первый?',context:refined.context,search:engine,llm:{interpret:async()=>({action:'discuss'})}});
 assert.equal(question.action,'discuss');assert.deepEqual(question.recipes,[]);
});
