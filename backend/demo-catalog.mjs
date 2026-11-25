import {readFileSync} from 'node:fs';
import {ingredientMatches} from './recipe-data.mjs';
const recipes=JSON.parse(readFileSync(new URL('./demo-recipes.json',import.meta.url),'utf8'));
const local=new Map(recipes.map(r=>[r.id,r]));
export function withDemoRecipes(search) {
 const raw=id=>{
  const r=local.get(id);
  return r?{...r,ingredients:r.ingredients.map(name=>({name,amount:null})),ingredientNames:r.ingredients,
   timeMinutes:Number.parseInt(r.time,10) || null,servings:null,nutrition:null}:search.raw(id);
 };
 return {...search,raw,
  recipe:id=>local.has(id)?present(id):search.recipe(id),
  present,
 };
 function present(id,options={}) {
  const r=local.get(id);
  if(!r)return search.present(id,options);
  return {...r,servings:null,originalServings:null,nutrition:null,scaled:false,sourceUrl:null,
   ingredientEntries:r.ingredients.map(name=>({name,amount:null})),
   matchedIngredients:(options.ingredients || []).filter(q=>r.ingredients.some(name=>ingredientMatches(q,name))),
   additionalIngredients:[],portionNote:options.servings?'В демонстрационном рецепте не указано исходное число порций.':null};
 }
}
