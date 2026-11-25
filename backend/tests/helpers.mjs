import { config } from '../config.mjs';
import { openStore } from '../store.mjs';
import { createApp } from '../server.mjs';
import { makeSearch } from '../search.mjs';
import { buildBm25Index } from '../../bm25/src/bm25.mjs';

export const recipes=[
 {id:'banana',title:'Банановое печенье',description:'Печенье из банана и овсянки.',
  ingredients:[{name:'банан',amount:'2 шт'},{name:'овсянка',amount:'100 г'}],
  ingredientNames:['банан','овсянка'],steps:['Разомните банан.'],categories:['Десерты'],aliases:['банановый десерт'],
  timeMinutes:20,nutrition:{per100g:{kcal:180,protein:4,fats:2,carbs:34}},sourceUrl:'https://www.povarenok.ru/recipes/show/1/'},
 {id:'cake',title:'Шоколадный торт',description:'Торт с сахаром.',ingredients:[{name:'сахар',amount:'100 г'},{name:'шоколад',amount:'100 г'}],
  ingredientNames:['сахар','шоколад'],steps:['Испеките корж.'],categories:['Десерты'],aliases:[],timeMinutes:60},
 {id:'mousse',title:'Банановый мусс',description:'Холодный десерт.',ingredients:[{name:'банан',amount:'1 шт'}],
  ingredientNames:['банан'],steps:[],categories:['Десерты'],aliases:[],timeMinutes:null},
];
export const search=makeSearch(buildBm25Index(recipes));
export async function withApp(fn,overrides={}) {
  const settings={...config({}),dbPath:':memory:',adminEmail:'admin@example.test',adminPassword:'test-admin-123',...overrides.settings};
  const db=openStore(':memory:');
  const app=await createApp({settings,db,search,llm:{configured:false,reply:async()=>({answer:null,llmStatus:'not_configured'})},...overrides,settings});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+app.server.address().port;
  const request=async(path,method='GET',data,cookie,extra={})=>{
    const response=await fetch(base+'/api'+path,{method,headers:{'Content-Type':'application/json','X-SweetMate-Request':'1',
      ...(cookie ? {Cookie:cookie} : {}),...extra},...(data===undefined?{}:{body:typeof data==='string'?data:JSON.stringify(data)})});
    const text=await response.text();
    return {status:response.status,data:text ? JSON.parse(text) : null,
      cookie:response.headers.get('set-cookie')?.split(';')[0],headers:response.headers};
  };
  const register=async(email='user@example.test')=>request('/auth/register','POST',{email,password:'test-user-123',confirmPassword:'test-user-123',role:'admin'});
  try { await fn({request,register,db,base}); } finally { await app.close(); }
}
