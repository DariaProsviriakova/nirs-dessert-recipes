import test from 'node:test';
import assert from 'node:assert/strict';
import {withApp} from './helpers.mjs';
const cookies=response=>response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
test('demo roles, statistics and sessions are isolated from real accounts and other browsers',()=>withApp(async({request,register,db})=>{
 const user=await register();
 await request('/search','POST',{query:'банан'},user.cookie);
 const initialAccounts=db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n;
 const demo=await request('/demo/login','POST',{role:'user'});
 assert.equal(demo.status,200);assert.equal(demo.data.role,'user');assert.equal(demo.data.demo,true);
 const demoCookie=cookies(demo);
 assert.equal((await request('/auth/me','GET',undefined,demoCookie)).data.id,demo.data.id);
 assert.equal((await request('/admin/stats','GET',undefined,demoCookie)).status,403);
 const found=await request('/search','POST',{query:'банан'},demoCookie);
 assert.equal(found.status,200);assert(found.data.recipes.length);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,1);
 assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts').get().n,initialAccounts);
 const admin=await request('/demo/login','POST',{role:'admin'},demoCookie),adminCookie=cookies(admin);
 assert.equal(admin.data.role,'admin');
 const stats=await request('/admin/stats','GET',undefined,adminCookie);
 assert.equal(stats.status,200);assert.equal(stats.data.requests,1);
 const other=await request('/demo/login','POST',{role:'admin'});
 assert.equal((await request('/admin/stats','GET',undefined,cookies(other))).data.requests,0);
 const sessionOnly=admin.headers.getSetCookie().find(c=>c.startsWith('sweetmate_session=')).split(';')[0];
 assert.equal((await request('/admin/stats','GET',undefined,sessionOnly)).status,401);
 const realLogin=await request('/auth/login','POST',{email:user.data.email,password:'test-user-123'},adminCookie);
 assert.equal(realLogin.data.demo,false);
 assert.equal(realLogin.data.id,user.data.id);
 assert(realLogin.headers.getSetCookie().some(c=>c.startsWith('sweetmate_demo_space=;') && c.includes('Max-Age=0')));
}));
test('documented demo credentials work, wrong credentials do not; demo mode can be disabled',async()=>{
 await withApp(async({request,db})=>{
  const login=await request('/auth/login','POST',{email:'admin@sweetmate.test',password:'admin123'});
  assert.equal(login.status,200);assert.equal(login.data.role,'admin');assert(login.data.demo);
  assert.equal((await request('/auth/login','POST',{email:'admin@sweetmate.test',password:'incorrect'})).status,401);
  const registered=await request('/auth/register','POST',{email:'user@sweetmate.test',password:'user123',confirmPassword:'user123'});
  assert.equal(registered.status,200);assert.equal(registered.data.role,'user');assert(registered.data.demo);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM accounts WHERE email IN (?,?)').get('admin@sweetmate.test','user@sweetmate.test').n,0);
  const adminCookie=cookies(login);
  await request('/auth/logout','POST',{},adminCookie);
  assert.equal((await request('/auth/me','GET',undefined,adminCookie)).status,401);
 });
 await withApp(async({request})=>{
  assert.equal((await request('/health')).data.demoEnabled,false);
  assert.equal((await request('/demo/login','POST',{role:'admin'})).status,404);
  assert.equal((await request('/auth/login','POST',{email:'admin@sweetmate.test',password:'admin123'})).status,401);
 },{settings:{demoEnabled:false}});
});

test('demo starter cards keep canonical photos and remain available to follow-up questions',()=>withApp(async({request})=>{
 const login=await request('/demo/login','POST',{role:'user'}),cookie=cookies(login);
 const recipe=await request('/recipes/tiramisu','GET',undefined,cookie);
 assert.equal(recipe.status,200);assert.equal(recipe.data.image,'/images/tiramisu.jpg');
 const followup=await request('/search','POST',{
  query:'сколько по времени готовить?',
  context:{selectedRecipeId:'tiramisu',displayedIds:['tiramisu']}
 },cookie);
 assert.equal(followup.status,200);
 assert.equal(followup.data.context.selectedRecipeId,'tiramisu');
 assert(!followup.data.answer.includes('Не поняла'));
 assert.equal(followup.data.recipes.length,0);
}));
