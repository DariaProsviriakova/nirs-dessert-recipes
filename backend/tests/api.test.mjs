import test from 'node:test';
import assert from 'node:assert/strict';
import { withApp } from './helpers.mjs';
import { currentSession } from '../auth.mjs';

test('register, normalize email, protect role, hash password, duplicate, valid/invalid login',()=>withApp(async({request,register,db})=>{
  const r=await register(' USER@Example.test ');
  assert.equal(r.status,201); assert.equal(r.data.email,'user@example.test'); assert.equal(r.data.role,'user');
  assert(!JSON.stringify(r.data).includes('password'));
  assert.match(r.headers.get('set-cookie'),/HttpOnly/);
  assert.match(r.headers.get('set-cookie'),/SameSite=Lax/);
  assert(!db.prepare('SELECT password_hash FROM accounts WHERE id=?').get(r.data.id).password_hash.includes('test-user'));
  assert.equal((await register()).status,409);
  assert.equal((await request('/auth/login','POST',{email:'missing@example.test',password:'wrong'})).status,401);
  assert.equal((await request('/auth/login','POST',{email:r.data.email,password:'wrong'})).status,401);
  assert.equal((await request('/auth/login','POST',{email:r.data.email,password:'test-user-123'})).status,200);
  assert.equal((await request('/auth/me','GET',undefined,r.cookie)).data.id,r.data.id);
  assert.equal((await request('/auth/me')).status,401);
  assert.equal(currentSession(db,{headers:{cookie:'sweetmate_session=forged'}}),null);
}));

test('validation, CSRF, role isolation and request counting including empty results',()=>withApp(async({request,register,db})=>{
  const user=await register();
  assert.equal((await request('/search','POST',{query:'банан'})).status,401);
  assert.equal((await request('/admin/stats','GET',undefined,user.cookie)).status,403);
  assert.equal((await request('/search','POST',{query:'банан'},user.cookie,{Origin:'https://evil.test'})).status,403);
  assert.equal((await request('/search','POST',{query:'банан'},user.cookie,{'X-SweetMate-Request':'0'})).status,403);
  for (const data of [{query:''},{query:'  '},{query:'я'.repeat(501)},{query:[]},{},'{']) {
    assert.equal((await request('/search','POST',data,user.cookie)).status,400);
  }
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,0);
  const found=await request('/search','POST',{query:'банан'},user.cookie);
  assert.equal(found.status,200); assert(found.data.recipes.length>0 && found.data.recipes.length<=3);
  assert.equal(found.data.llmStatus,'not_configured'); assert(!JSON.stringify(found.data).includes('"score"'));
  const empty=await request('/search','POST',{query:'ксдфжщы'},user.cookie);
  assert.equal(empty.data.status,'empty'); assert.equal(empty.data.answer,''); assert.deepEqual(empty.data.recipes,[]);
  const clarification=await request('/search','POST',{query:'до 200 ккал'},user.cookie);
  assert.equal(clarification.data.status,'clarification');
  await request('/recipes/banana','GET',undefined,user.cookie);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM events').get().n,3);
  const admin=await request('/auth/login','POST',{email:'admin@example.test',password:'test-admin-123'});
  const stats=await request('/admin/stats','GET',undefined,admin.cookie);
  assert.equal(stats.data.requests,3); assert.equal(stats.data.noResults,1);
  assert(stats.data.popular.some(r=>r.id==='banana'));
  for (const secret of ['query_id','session_id','account_id','email','password','test-user']) assert(!JSON.stringify(stats.data).includes(secret));
}));

test('profile updates, password checks, revocation, logout and account deletion',()=>withApp(async({request,register,db})=>{
  const user=await register(),cookie=user.cookie;
  assert.equal((await request('/profile','PATCH',{displayName:' '},cookie)).status,400);
  const profile=await request('/profile','PATCH',{displayName:'  Тест   Профиля  '},cookie);
  assert.equal(profile.data.displayName,'Тест Профиля');
  const second=await request('/auth/login','POST',{email:user.data.email,password:'test-user-123'});
  assert.equal((await request('/profile/password','POST',{currentPassword:'wrong',newPassword:'new-password',confirmPassword:'new-password'},cookie)).status,400);
  const changed=await request('/profile/password','POST',{currentPassword:'test-user-123',newPassword:'new-password',confirmPassword:'new-password'},cookie);
  assert.equal(changed.status,204);
  assert.equal((await request('/auth/me','GET',undefined,second.cookie)).status,401);
  assert.equal((await request('/auth/me','GET',undefined,cookie)).status,401);
  await request('/search','POST',{query:'банан'},changed.cookie);
  const deleted=await request('/profile','DELETE',{},changed.cookie);
  assert.equal(deleted.status,204);
  assert.equal((await request('/auth/me','GET',undefined,changed.cookie)).status,401);
  assert.equal(db.prepare('SELECT account_id FROM events').get().account_id,null);
  const fresh=await register();
  const loggedOut=await request('/auth/logout','POST',{},fresh.cookie);
  assert.equal(loggedOut.status,204);
  assert.equal((await request('/auth/me','GET',undefined,fresh.cookie)).status,401);
}));

test('accepted search failures counted once; LLM failure preserves recipes',async()=>{
  await withApp(async({request,register,db})=>{
    const user=await register();
    assert.equal((await request('/search','POST',{query:'банан'},user.cookie)).status,500);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM events WHERE status='error'").get().n,1);
  },{search:{size:0,run(){throw new Error('SECRET');},recipe(){return null;}}});
  await withApp(async({request,register})=>{
    const user=await register();
    const r=await request('/search','POST',{query:'банан'},user.cookie);
    assert.equal(r.status,200); assert(r.data.recipes.length); assert.equal(r.data.llmStatus,'unavailable');
  },{llm:{configured:true,reply:async()=>({answer:null,llmStatus:'unavailable'})}});
});

test('expired sessions rejected; analytics retention; malformed bodies hidden',()=>withApp(async({request,register,db})=>{
  const user=await register();
  db.prepare("UPDATE sessions SET expires_at='2000-01-01T00:00:00.000Z'").run();
  assert.equal((await request('/auth/me','GET',undefined,user.cookie)).status,401);
  assert.equal((await request('/auth/register','POST',{email:'bad',password:'123456',confirmPassword:'123456'})).status,400);
  assert.equal((await request('/auth/register','POST',{email:'x@example.test',password:'123',confirmPassword:'123'})).status,400);
  assert.equal((await request('/auth/register','POST','x'.repeat(17000))).status,413);
  assert.equal((await request('/unknown')).status,404);
}));

test('authentication rate limited',()=>withApp(async({request})=>{
  let last;
  for(let i=0;i<16;i++) last=await request('/auth/login','POST',{email:'none@example.test',password:'wrong'});
  assert.equal(last.status,429);
}));

test('strict ingredient matching returns empty without counting unrelated recipe IDs',()=>withApp(async({request,register,db})=>{
  const user=await register();
  const result=await request('/search','POST',{query:'у меня есть банан и молоко'},user.cookie);
  assert.equal(result.status,200);assert.equal(result.data.status,'empty');assert.equal(result.data.answer,'');assert.deepEqual(result.data.recipes,[]);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM result_recipes').get().n,0);
  assert.equal(db.prepare('SELECT status FROM events').get().status,'empty');
}));
