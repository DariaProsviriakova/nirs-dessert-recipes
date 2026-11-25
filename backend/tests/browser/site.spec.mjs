import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const password='Synthetic-user-2026';
async function register(page,email='browser-'+randomUUID()+'@example.test') {
  await page.goto('/');
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль',{exact:true}).fill(password);
  await page.getByLabel('Повторите пароль',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Зарегистрироваться',exact:true}).click();
  await expect(page.getByRole('button',{name:'Отправить',exact:true})).toBeVisible();
  return email;
}
async function profile(page) {
  await page.locator('.user-menu__button').click();
  await page.getByRole('button',{name:'Профиль',exact:true}).click();
}
test('guest isolation, register, real BM25, recipe, favorites, chats and profile',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');
  await page.evaluate(()=>{localStorage.setItem('sweetmate:user','old-demo-user');localStorage.setItem('sweetmate:email','admin@sweetmate.test');});
  await page.reload();
  await expect(page.getByRole('button',{name:'Отправить',exact:true})).toHaveCount(0);
  await expect(page.getByText('Просмотр',{exact:true})).toBeVisible();
  await register(page);
  await page.getByLabel('Задайте вопрос о десертах').fill('банан до 30 минут без сахара');
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.locator('.recipe-card')).toHaveCount(3);
  await expect(page.locator('.messages').getByText('Подобрала десерты со всеми указанными продуктами.',{exact:false})).toBeVisible();
  const title=await page.locator('.recipe-card h2').first().textContent();
  await page.locator('.recipe-card').first().getByRole('button',{name:'Добавить в избранное'}).click();
  await expect(page.locator('.favorite-entry')).toHaveCount(1);
  await page.locator('.recipe-card').first().getByRole('button',{name:'Открыть полный рецепт'}).click();
  await expect(page.getByRole('link',{name:'Источник: Поварёнок'})).toBeVisible();
  await expect(page.locator('.recipe-detail h3')).toHaveText(title);
  await page.reload();
  await expect(page.locator('.recipe-detail h3')).toHaveText(title);
  await expect(page.locator('.favorite-entry')).toHaveCount(1);
  const storage=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage)));
  expect(storage['sweetmate:user']).toBe('old-demo-user');
  expect(JSON.stringify(storage)).not.toContain(password);
  await profile(page);
  await page.getByLabel('Отображаемое имя').fill('Тестовый Пекарь');
  await page.getByRole('button',{name:'Сохранить имя'}).click();
  await expect(page.getByText('Имя профиля обновлено.')).toBeVisible();
  await page.getByRole('button',{name:'Вернуться к чату',exact:true}).click();
  await page.screenshot({path:'backend/.test-artifacts/site-desktop.png',fullPage:true,animations:'disabled'});
  expect(errors).toEqual([]);
});
test('empty query, no results, clarification, network error preserve question',async({page})=>{
  await register(page);
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Введите вопрос');
  for(const [query,text] of [
    ['ксдфжщы','Среди найденных десертов нет вариантов'],
    ['банан до 200 ккал','Уточните, КБЖУ нужны на 100 г или на порцию.'],
  ]) {
    await page.getByLabel('Задайте вопрос о десертах').fill(query);
    await page.getByRole('button',{name:'Отправить',exact:true}).click();
    await expect(page.locator('.messages').getByText(text,{exact:false})).toBeVisible();
  }
  await page.route('**/api/search',route=>route.abort());
  await page.getByLabel('Задайте вопрос о десертах').fill('шоколадный десерт');
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось связаться');
  await expect(page.getByLabel('Задайте вопрос о десертах')).toHaveValue('шоколадный десерт');
});
test('mobile 360px, menu and results have no horizontal overflow',async({page})=>{
  await page.setViewportSize({width:360,height:800});
  await register(page);
  await page.getByLabel('Задайте вопрос о десертах').fill('шоколадный десерт');
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  await expect(page.locator('.recipe-card')).toHaveCount(3);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Открыть меню'}).click();
  await expect(page.getByRole('button',{name:'Новый чат',exact:false})).toBeVisible();
  await page.getByRole('button',{name:'Новый чат',exact:false}).click();
  await expect(page.getByLabel('Задайте вопрос о десертах')).toBeVisible();
  await page.screenshot({path:'backend/.test-artifacts/site-mobile.png',fullPage:true,animations:'disabled'});
});
test('admin has aggregate view and ordinary users cannot request it',async({page,request})=>{
  await page.goto('/');
  await page.locator('.topbar').getByRole('button',{name:'Войти',exact:true}).click();
  await page.getByLabel('Электронная почта').fill('admin-e2e@example.test');
  await page.getByLabel('Пароль',{exact:true}).fill('Synthetic-admin-2026');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Обзор',exact:true})).toBeVisible();
  const health=await (await request.get('/api/health')).json();
  await expect(page.getByText(health.catalogSize.toLocaleString('ru-RU'),{exact:true})).toBeVisible();
  await expect(page.getByText('Запросы по дням',{exact:true})).toBeVisible();
  await page.screenshot({path:'backend/.test-artifacts/site-admin.png',fullPage:true,animations:'disabled'});
  expect((await request.get('/api/admin/stats')).status()).toBe(401);
});
test('password change, logout, new login, delete only synthetic account',async({page})=>{
  const email=await register(page);
  await profile(page);
  await page.getByLabel('Текущий пароль',{exact:true}).fill(password);
  await page.getByLabel('Новый пароль',{exact:true}).fill('Synthetic-changed-2026');
  await page.getByLabel('Повторите новый пароль',{exact:true}).fill('Synthetic-changed-2026');
  await page.getByRole('button',{name:'Сменить пароль'}).click();
  await expect(page.getByRole('status')).toContainText('Пароль обновлён');
  await page.getByRole('button',{name:'Выйти',exact:true}).click();
  await page.locator('.topbar').getByRole('button',{name:'Войти',exact:true}).click();
  await page.getByLabel('Электронная почта').fill(email);
  await page.getByLabel('Пароль',{exact:true}).fill('Synthetic-changed-2026');
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await expect(page.getByRole('button',{name:'Отправить',exact:true})).toBeVisible();
  await profile(page);
  page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Удалить учетную запись',exact:true}).click();
  await expect(page.getByText('Просмотр',{exact:true})).toBeVisible();
});

test('impossible ingredient combination is not replaced with unrelated recipes; composer stays visible',async({page})=>{
  await page.setViewportSize({width:2560,height:1240});
  await register(page);
  const query='у меня есть печенье, яйца, молоко, овощи';
  for (let i=0;i<3;i++) {
    await page.getByLabel('Задайте вопрос о десертах').fill(query);
    await page.getByRole('button',{name:'Отправить',exact:true}).click();
    await expect(page.locator('.message--assistant').last().locator('.recipe-card')).toHaveCount(0);
    await expect(page.locator('.message--assistant').last()).toContainText('Со всеми перечисленными продуктами подходящих вариантов не нашлось');
    await expect(page.getByLabel('Задайте вопрос о десертах')).toBeInViewport();
    await expect(page.getByRole('button',{name:'Отправить',exact:true})).toBeInViewport();
  }
  const titles=await page.locator('.recipe-card h2').allTextContents();
  expect(titles.every(title=>!/киш|хачапури|овощ|закусочн/i.test(title))).toBe(true);
  const stats=await page.evaluate(()=>({
    viewport:innerHeight,body:document.documentElement.scrollHeight,
    composer:document.querySelector('.composer').getBoundingClientRect().toJSON(),
  }));
  expect(stats.body).toBeLessThanOrEqual(stats.viewport+1);
  await page.screenshot({path:'backend/.test-artifacts/site-query-regression.png',fullPage:true,animations:'disabled'});
});

async function sendTurn(page,query) {
  await page.getByLabel('Задайте вопрос о десертах').fill(query);
  const response=page.waitForResponse(r=>r.url().endsWith('/api/search'));
  await page.getByRole('button',{name:'Отправить',exact:true}).click();
  const result=await (await response).json();
  await expect(page.getByRole('button',{name:'Отправить',exact:true})).toBeEnabled();
  return result;
}
test('conversation remembers ingredients, compares calories, shows dish nutrition and scales six portions',async({page})=>{
  await register(page);
  await page.getByRole('button',{name:'Попробовать пример с бананом и молоком'}).click();
  await expect(page.getByLabel('Задайте вопрос о десертах')).toHaveValue('У меня есть банан и молоко. Что можно приготовить?');
  const first=await sendTurn(page,'У меня есть банан и молоко. Что можно приготовить?');
  expect(first.recipes.length).toBeGreaterThan(0);
  expect(first.recipes.every(r=>r.matchedIngredients.includes('банан') && r.matchedIngredients.includes('молоко'))).toBe(true);
  const lower=await sendTurn(page,'где меньше калорий');
  const calories=lower.recipes.map(r=>r.nutrition.per100g.kcal);
  expect(calories).toEqual([...calories].sort((a,b)=>a-b));
  const chosen=first.recipes.find(r=>r.servings>0);
  expect(chosen).toBeTruthy();
  await page.locator('.recipe-card').filter({has:page.getByRole('heading',{name:chosen.title,exact:true})}).first().getByRole('button',{name:'Открыть полный рецепт'}).click();
  const nutrition=await sendTurn(page,'покажи его КБЖУ');
  expect(nutrition.nutrition.recipeId).toBe(chosen.id);
  await expect(page.locator('.nutrition-result').last()).toContainText(chosen.title);
  const scaled=await sendTurn(page,'на 6 человек');
  expect(scaled.recipes[0].servings).toBe(6);
  expect(scaled.recipes[0].nutrition.per100g.kcal).toBe(chosen.nutrition.per100g.kcal);
  await expect(page.locator('.message--assistant').last()).toContainText('Порций: 6');
  await page.reload();
  const followup=await sendTurn(page,'а КБЖУ на порцию');
  expect(followup.context.servings).toBe(6);
  expect(followup.nutrition.recipeId).toBe(chosen.id);
  expect(followup.nutrition.basis).toBe('perServing');
  await page.screenshot({path:'backend/.test-artifacts/site-dialogue.png',fullPage:true,animations:'disabled'});
});
test('all three pantry ingredients must appear on every returned card',async({page})=>{
  await register(page);
  const result=await sendTurn(page,'есть мука и орехи и молоко');
  expect(result.recipes.length).toBeGreaterThan(0);
  for(const recipe of result.recipes) expect(recipe.matchedIngredients).toEqual(['мука','орехи','молоко']);
  await expect(page.locator('.recipe-card').first()).toContainText('Из вашего запроса: мука, орехи, молоко');
});

test('calorie clarification has no unrelated cards and random input does not replay results',async({page})=>{
 await register(page);
 const first=await sendTurn(page,'есть банан и молоко');
 const question=await sendTurn(page,'сколько калорий?');
 expect(question.action).toBe('nutrition');
 expect(question.status).toBe('clarification');
 expect(question.recipes).toEqual([]);
 expect(question.context.displayedIds).toEqual(first.context.displayedIds);
 await expect(page.locator('.message--assistant').last().locator('.recipe-card')).toHaveCount(0);
 await page.reload();
 const answer=await sendTurn(page,'у первого');
 expect(answer.action).toBe('nutrition');
 expect(answer.nutrition.recipeId).toBe(first.context.displayedIds[0]);
 await expect(page.locator('.message--assistant').last().locator('.recipe-card')).toHaveCount(0);
 await expect(page.locator('.message--assistant').last().locator('.nutrition-result')).toBeVisible();
 const compared=await sendTurn(page,'где меньше калорий');
 const unknown=await sendTurn(page,'kugfthhkj');
 expect(unknown.status).toBe('clarification');
 expect(unknown.recipes).toEqual([]);
 expect(unknown.context).toEqual(compared.context);
 await expect(page.locator('.message--assistant').last()).toContainText('Не поняла сообщение');
 await expect(page.locator('.message--assistant').last().locator('.recipe-card')).toHaveCount(0);
});

test('portion size follow-ups answer about the selected recipe without duplicate cards',async({page})=>{
 await register(page);
 const first=await sendTurn(page,'есть банан и молоко');
 const selected=await sendTurn(page,'первый');
 await sendTurn(page,'КБЖУ');
 for(const query of ['насколько большая порция?','порции']) {
  const response=await sendTurn(page,query);
  expect(response.action).toBe('discuss');
  expect(response.status).toBe('found');
  expect(response.context.selectedRecipeId).toBe(selected.recipeDetail.id);
  expect(response.recipes).toEqual([]);
  await expect(page.locator('.message--assistant').last()).toContainText('Вес одной порции в граммах не указан');
  await expect(page.locator('.message--assistant').last()).toContainText(String(first.recipes[0].servings));
  await expect(page.locator('.message--assistant').last().locator('.recipe-card')).toHaveCount(0);
 }
 await page.reload();
 const continued=await sendTurn(page,'насколько большая порция?');
 expect(continued.context.selectedRecipeId).toBe(selected.recipeDetail.id);
});

test('all-chat recipe memory survives another search, selecting details, reload and old chat migration',async({page})=>{
 await register(page);
 const first=await sendTurn(page,'есть банан и молоко');
 await sendTurn(page,'первый');
 const time=await sendTurn(page,'сколько по времени готовит');
 expect(time.action).toBe('discuss');expect(time.status).toBe('found');expect(time.recipes).toEqual([]);
 const second=await sendTurn(page,'приготовление второго блюда сколько по времени занимает');
 expect(second.context.selectedRecipeId).toBe(first.recipes[1].id);
 await sendTurn(page,'есть мука и орехи и молоко');
 await page.reload();
 const old=await sendTurn(page,'сколько времени готовить '+first.recipes[0].title);
 expect(old.context.selectedRecipeId).toBe(first.recipes[0].id);
 expect(first.recipes.every(r=>old.context.knownRecipeIds.includes(r.id))).toBe(true);
 const numbered=await sendTurn(page,'сколько времени занимает второе блюдо из первой подборки');
 expect(numbered.context.selectedRecipeId).toBe(first.recipes[1].id);
 await expect(page.locator('.message--assistant').last().locator('.recipe-card')).toHaveCount(0);
 // Existing local histories contain the full cards, even before memory fields existed.
 await page.evaluate(()=>{
  for(const key of Object.keys(localStorage).filter(k=>k.startsWith('sweetmate:v2:chats:'))) {
   const chats=JSON.parse(localStorage.getItem(key));
   for(const chat of chats)for(const message of chat.messages)if(message.context) {
    delete message.context.knownRecipeIds;delete message.context.recipeGroups;
   }
   localStorage.setItem(key,JSON.stringify(chats));
  }
 });
 await page.reload();
 const restored=await sendTurn(page,'КБЖУ '+first.recipes[0].title);
 expect(restored.nutrition.recipeId).toBe(first.recipes[0].id);
 await page.getByRole('button',{name:'Новый чат',exact:false}).click();
 const fresh=await sendTurn(page,'сколько по времени готовит');
 expect(fresh.status).toBe('clarification');
 expect(fresh.context.knownRecipeIds).toEqual([]);
});

test('guest example, demo user and isolated demo admin support complete role transitions',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('/');
 await expect(page.getByText('Просмотр',{exact:true})).toBeVisible();
 await expect(page.locator('.recipe-card')).toHaveCount(3);
 await expect(page.getByRole('button',{name:'Отправить',exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Попробовать как пользователь',exact:true}).click();
 await expect(page.getByText('Демо-режим',{exact:true})).toBeVisible();
 const me=await (await page.request.get('/api/auth/me')).json();
 expect(me.role).toBe('user');expect(me.demo).toBe(true);
 expect((await page.request.get('/api/admin/stats')).status()).toBe(403);
 const result=await sendTurn(page,'есть банан и молоко');
 expect(result.recipes.length).toBeGreaterThan(0);
 await page.locator('.recipe-card').first().getByRole('button',{name:'Добавить в избранное'}).click();
 await page.reload();
 await expect(page.getByText('Демо-режим',{exact:true})).toBeVisible();
 await expect(page.locator('.favorite-entry')).toHaveCount(1);
 await page.locator('.user-menu__button').click();
 await page.getByRole('button',{name:'Выйти',exact:true}).click();
 await expect(page.getByText('Просмотр',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Посмотреть как администратор',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Обзор',exact:true})).toBeVisible();
 await expect(page.getByText('Демо-режим · только просмотр',{exact:true})).toBeVisible();
 const stats=await (await page.request.get('/api/admin/stats')).json();
 expect(stats.requests).toBe(1);
 await page.screenshot({path:'backend/.test-artifacts/demo-admin.png',fullPage:true,animations:'disabled'});
 await page.getByRole('button',{name:'Вернуться в чат',exact:true}).click();
 await expect(page.getByText('Демо-режим',{exact:true})).toBeVisible();
 expect(await page.locator('.favorite-entry').count()).toBe(0);
 expect(errors).toEqual([]);
});
test('documented admin demo login and guest test buttons work on mobile',async({page})=>{
 await page.setViewportSize({width:360,height:800});
 await page.goto('/');
 await page.locator('.topbar').getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByRole('button',{name:'Тестовый пользователь',exact:true})).toBeVisible();
 await page.getByLabel('Электронная почта').fill('admin@sweetmate.test');
 await page.getByLabel('Пароль',{exact:true}).fill('admin123');
 await page.getByRole('button',{name:'Войти',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Обзор',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:'backend/.test-artifacts/demo-mobile.png',fullPage:true,animations:'disabled'});
});

test('demo popular starters keep original photos before and after real searches and reload',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Попробовать как пользователь',exact:true}).click();
 await expect(page.getByRole('button',{name:'Отправить',exact:true})).toBeVisible();
 const starter=page.locator('.popular-card').first();
 await expect(starter).toContainText('Тирамису');
 await expect(starter.locator('img')).toHaveAttribute('src','/images/tiramisu.jpg');
 await expect.poll(()=>starter.locator('img').evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
 await sendTurn(page,'есть банан и молоко');
 await expect(starter).toContainText('Тирамису');
 await page.reload();
 await expect(starter.locator('img')).toHaveAttribute('src','/images/tiramisu.jpg');
 await starter.click();
 await expect(page.locator('.recipe-detail h3').last()).toHaveText('Тирамису');
 const time=await sendTurn(page,'сколько по времени готовить?');
 expect(time.context.selectedRecipeId).toBe('tiramisu');
 expect(time.action).toBe('discuss');
});
test('nut allergy produces new recommendations and confirmation preserves the restriction',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Попробовать как пользователь',exact:true}).click();
 await expect(page.getByRole('button',{name:'Отправить',exact:true})).toBeVisible();
 await sendTurn(page,'есть шоколад и орехи');
 let result=await sendTurn(page,'у меня аллергия на орехи, предложи что то без них');
 expect(result.action).toBe('search');
 expect(result.context.allergies).toContain('орехи');
 if(result.context.pendingAction)result=await sendTurn(page,'да');
 expect(result.recipes.length).toBeGreaterThan(0);
 for(const r of result.recipes) expect(r.ingredientEntries.some(i=>/орех|миндаль|фундук|арахис|кешью|фисташ|пекан|макадам/iu.test(i.name))).toBe(false);
 await page.reload();
 const retry=await sendTurn(page,'рецепт без орехов');
 expect(retry.context.allergies).toContain('орехи');
 expect(retry.recipes.length).toBeGreaterThan(0);
 for(const r of retry.recipes) expect(r.ingredientEntries.some(i=>/орех|миндаль|фундук|арахис|кешью|фисташ|пекан|макадам/iu.test(i.name))).toBe(false);
});
