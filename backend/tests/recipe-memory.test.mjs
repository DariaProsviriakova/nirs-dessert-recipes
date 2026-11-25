import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeMemory,resolveRecipeReference} from '../recipe-memory.mjs';
const recipes=[
 {id:'a',title:'Мороженое с бананом'}, {id:'b',title:'Банановый манник'},
 {id:'c',title:'Пирог с орехами'}, {id:'d',title:'Первый поцелуй'},
 {id:'e',title:'Мороженое с клубникой'},
];
const search={raw:id=>recipes.find(r=>r.id===id)};
const context={knownRecipeIds:['a','b','c','d','e'],recipeGroups:[['a','b'],['c','d','e']],displayedIds:['c','d','e'],selectedRecipeId:'c'};
test('the memory validates every ID and tolerates malformed client fields',()=>{
 assert.deepEqual(recipeMemory({knownRecipeIds:['a','foreign'],recipeGroups:[['foreign','b']]},search).knownRecipeIds,['a','b']);
 assert.doesNotThrow(()=>recipeMemory({knownRecipeIds:{}},search));
});
test('references use current groups, older groups and all-chat names without forgetting dishes',()=>{
 for(const [query,id] of [
  ['второе блюдо','d'],['второе из первой подборки','b'],
  ['первое из предыдущей подборки','a'],['сколько времени у бананового манника','b'],
  ['КБЖУ Первый поцелуй','d'],['второе блюдо в чате','b'],
 ])assert.equal(resolveRecipeReference(query,context,search).id,id,query);
 const ambiguous=resolveRecipeReference('у мороженого',context,search);
 assert.equal(ambiguous.id,null);
 assert.deepEqual(new Set(ambiguous.candidates),new Set(['a','e']));
});
