import test from 'node:test';
import assert from 'node:assert/strict';
import { makeSearch } from '../search.mjs';
import { buildBm25Index } from '../../bm25/src/bm25.mjs';
import { search, recipes } from './helpers.mjs';
import { makeLLM, validateExplanation } from '../llm.mjs';
import { config } from '../config.mjs';
import { openStore, prune } from '../store.mjs';

test('search uses exact titles, aliases as cards, restrictions, missing values, clarification and source adapter',()=>{
  assert.equal(search.run('Банановое печенье').status,'exact');
  assert.equal(search.run('банановый десерт').status,'found');
  assert.equal(search.run('Банановое печенье и Шоколадный торт').status,'clarification');
  const result=search.run('банан до 30 минут без сахара');
  assert(result.recipes.length); assert(result.recipes.every(r=>r.id==='banana'));
  assert.equal(search.run('банан до 100 ккал на 100 г').status,'empty');
  assert.equal(search.run('банан до 200 ккал').status,'clarification');
  assert(!search.run('не хочу Банановое печенье').recipes.some(r=>r.id==='banana'));
  assert.equal(search.recipe('banana').image,'/images/recipe-placeholder.svg');
  assert.equal(search.recipe('mousse').time,'Время не указано');
  assert.equal(search.recipe('missing'),null);
});

test('grounding rejects invented facts, unknown IDs and health claims',()=>{
  assert.match(validateExplanation(JSON.stringify({recommendations:[{id:'banana',evidence:'банана и овсянки'}]}),recipes),/банана и овсянки/);
  assert.equal(validateExplanation('{"recommendations":[]}',recipes),null);
  for(const item of [{id:'unknown',evidence:'банан'},{id:'banana',evidence:'добавьте мёд'},{id:'banana',evidence:''}]) {
    assert.throws(()=>validateExplanation(JSON.stringify({recommendations:[item]}),recipes));
  }
  assert.throws(()=>validateExplanation('не JSON',recipes));
});

test('GigaChat OAuth and completion use retrieved recipes, cache access token, validate output',async()=>{
  const calls=[];
  const fetcher=async(url,options)=>{
    calls.push({url,...options});
    return {ok:true,json:async()=>url.endsWith('oauth') ? {access_token:'fake-token',expires_at:Date.now()+1800000} :
      {choices:[{message:{content:'{"recommendations":[{"id":"banana","evidence":"банана и овсянки"}]}'}}]}};
  };
  const llm=makeLLM({...config({}),llmProvider:'gigachat',llmKey:'test-key'},fetcher);
  const r=await llm.explain('банан',[recipes[0]]);
  assert.equal(r.llmStatus,'ok'); assert.match(r.answer,/банана и овсянки/);
  await llm.explain('банан',[recipes[0]]);
  assert.equal(calls.length,3);
  assert.equal(calls[0].headers.Authorization,'Basic test-key');
  assert.equal(calls[1].headers.Authorization,'Bearer fake-token');
  const body=JSON.parse(calls[1].body),data=JSON.parse(body.messages[1].content);
  assert.equal(data.recipes.length,1); assert.equal(data.recipes[0].id,'banana');
  assert(!calls[1].body.includes('test-user'));
});

test('GigaChat network failure and malformed output produce safe fallback',async()=>{
  const settings={...config({}),llmProvider:'gigachat',llmKey:'test'};
  const failed=makeLLM(settings,async()=>{throw new Error('private-key');});
  assert.deepEqual(await failed.explain('банан',recipes),{answer:null,llmStatus:'unavailable'});
  const invalid=makeLLM({...settings,llmProvider:'openai-compatible'},async()=>({ok:true,json:async()=>({choices:[{message:{content:'Добавьте мёд'}}]})}));
  assert.equal((await invalid.explain('банан',recipes)).llmStatus,'invalid_response');
  assert.equal((await makeLLM({...settings,llmKey:''}).explain('банан',recipes)).llmStatus,'not_configured');
});

test('retention removes old events and expired sessions',()=>{
  const db=openStore(':memory:');
  db.prepare('INSERT INTO events VALUES (?,?,?,?,?,?,?)').run('old',null,'session','query','2000-01-01T00:00:00.000Z','empty',0);
  prune(db,90);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);
  db.close();
});

test('nested source titles do not trigger clarification for a single dessert',()=>{
  const engine=makeSearch(buildBm25Index([...recipes,{...recipes[0],id:'short',title:'Печенье'}]));
  assert.notEqual(engine.run('Банановое печенье').status,'clarification');
});

test('no-bake labels in titles are not discarded by the backend exclusion adapter',()=>{
  const recipe={...recipes[0],id:'cold',title:'Банановый десерт без выпечки',categories:['Десерты','Без выпечки'],steps:['Охладите десерт.']};
  const engine=makeSearch(buildBm25Index([recipe]));
  assert.equal(engine.run('банан без выпечки').recipes[0]?.id,'cold');
});

test('fact IDs ground explanations without requiring the model to copy exact quotations',()=>{
  const result=validateExplanation('{"recommendations":[{"id":"banana","evidenceIds":["ingredient:0","ingredient:1"]}]}',recipes);
  assert.match(result,/В составе: банан, овсянка/);
  assert.throws(()=>validateExplanation('{"recommendations":[{"id":"banana","evidenceIds":["ingredient:999"]}]}',recipes));
});

test('available ingredients cannot be matched only through an author description about brine',async()=>{
  let calls=0;
  const llm=makeLLM({...config({}),llmProvider:'gigachat',llmKey:'synthetic'},async()=>{calls++;throw new Error('must not call');});
  const docs=[{id:'brine',title:'Печенье на рассоле',description:'Рассол от огурцов и помидоров.',
    ingredients:[{name:'Рассол'},{name:'Мука'},{name:'Сахар'}]}];
  const result=await llm.explain('есть огурцы и помидоры',docs);
  assert.equal(result.llmStatus,'insufficient_data');
  assert.deepEqual(result.recommendedIds,[]);
  assert.equal(calls,0);
});
