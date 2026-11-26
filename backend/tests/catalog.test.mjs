import test from 'node:test';
import assert from 'node:assert/strict';
import { isDessert } from '../catalog.mjs';
import { makeSearch } from '../search.mjs';
import { buildBm25Index } from '../../bm25/src/bm25.mjs';
const recipe=(title,ingredients,categories=['Выпечка','Открытый пирог, тарт'])=>({
 id:title,title,description:'',ingredients:ingredients.map(name=>({name})),ingredientNames:ingredients,categories,steps:[],aliases:[],
});
test('savory pastries are rejected even when their filling heuristic matched butter or sugar',()=>{
  for (const r of [
    recipe('Киш с мексиканскими овощами',['Мука','Масло сливочное','Ветчина','Овощи']),
    recipe('Хачапури с запеченными овощами',['Сахар','Помидор','Молоко']),
    recipe('Пирог с овощами "Огород"',['Масло сливочное','Картофель','Лук репчатый']),
    recipe('Кекс с ветчиной',['Сахар','Ветчина'],['Выпечка','Кексы']),
    recipe('Луковый пирог',['Масло сливочное','Мука','Лук репчатый']),
  ]) assert.equal(isDessert(r),false,r.title);
});
test('actual desserts, fruit pies and sugar-free desserts stay available',()=>{
  for (const r of [
    recipe('Яблочный пирог',['Яблоко','Масло сливочное','Мука']),
    recipe('Пирог со сливами',['Слива','Мука','Масло сливочное']),
    recipe('Шоколадные маффины',['Какао-порошок','Сахар','Яйцо куриное','Желток яичный'],['Выпечка','Кексы']),
    recipe('Морковный торт',['Морковь','Сахар'],['Десерты','Торты']),
    recipe('Банановое печенье без сахара',['Банан','Овсянка'],['Десерты','Печенье']),
  ]) assert.equal(isDessert(r),true,r.title);
});
test('excluded dishes cannot leak through search, exact titles or direct recipe lookup',()=>{
  const bad=recipe('Киш с мексиканскими овощами',['Мука','Масло сливочное','Овощи','Ветчина']);
  const good=recipe('Печенье с молоком',['Печенье','Молоко'],['Десерты','Печенье']);
  const engine=makeSearch(buildBm25Index([bad,good]));
  assert.equal(engine.size,1);
  assert.equal(engine.recipe(bad.id),null);
  assert(!engine.run(bad.title).recipes.some(r=>r.id===bad.id));
  assert.deepEqual(engine.run('у меня есть печенье, яйца, молоко, овощи').recipes.map(r=>r.id),[good.id]);
});

test('an ingredient inventory is not mistaken for an exact dessert with a generic ingredient title',()=>{
  const generic=recipe('Молоко',['Молоко','Сахар'],['Десерты']);
  const cookies=recipe('Печенье с молоком',['Печенье','Молоко'],['Десерты']);
  const engine=makeSearch(buildBm25Index([generic,cookies]));
  const result=engine.run('у меня есть печенье, яйца, молоко, овощи');
  assert.equal(result.status,'found');
  assert.equal(result.recipes.length,2);
});

test('chicken eggs and butter remain dessert ingredients, chicken meat does not',()=>{
  assert.equal(isDessert(recipe('Ванильный кекс',['Мука','Яйцо куриное','Масло сливочное','Сахар'],['Выпечка','Кексы'])),true);
  assert.equal(isDessert(recipe('Кекс с филе',['Мука','Филе куриное','Сахар'],['Выпечка','Кексы'])),false);
});
