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
 assert.equal(result.answer,'Предлагаю банановый крем.');
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
