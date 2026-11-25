import {withDemoRecipes} from './demo-catalog.mjs';
import {demoSpaces,demoRole} from './demo.mjs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './config.mjs';
import { openStore, prune, snapshot } from './store.mjs';
import { ApiError, emailAddress, passwordValue, hashPassword, verifyPassword, bootstrapAdmin,
  publicAccount, createSession, currentSession, sessionCookie } from './auth.mjs';
import { openSearch } from './search.mjs';
import { makeLLM } from './llm.mjs';
import { converse } from './dialogue.mjs';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.jpg':'image/jpeg','.png':'image/png','.ico':'image/x-icon'};
async function body(req,maxBytes=16384) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw new ApiError(415,'Ожидается JSON.');
  const chunks=[]; let bytes=0;
  for await (const chunk of req) {
    bytes+=chunk.length;
    if (bytes>maxBytes) throw new ApiError(413,'Слишком большой запрос.');
    chunks.push(chunk);
  }
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value!=='object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new ApiError(400,'Некорректный запрос.'); }
}
export async function createApp({settings=config(),db=openStore(settings.dbPath),search=openSearch(settings.indexPath),llm=makeLLM(settings)}={}) {
  await bootstrapAdmin(db,settings);
  prune(db,settings.analyticsDays);
  const demos=demoSpaces(settings);
  const authAttempts=new Map(),searchAttempts=new Map(),demoAttempts=new Map();
  function limit(map,key,max) {
    const now=Date.now(),previous=map.get(key);
    const entry=!previous || previous.until<now ? {count:0,until:now+60000} : previous;
    if (++entry.count>max) throw new ApiError(429,'Слишком много попыток. Повторите через минуту.');
    map.set(key,entry);
    if (map.size>10000) for (const [k,v] of map) if (v.until<now) map.delete(k);
  }
  function send(res,status,value,cookie) {
    res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',...(cookie ? {'Set-Cookie':cookie} : {})});
    res.end(value===undefined ? '' : JSON.stringify(value));
  }
  const server=http.createServer(async(req,res)=>{
    const started=Date.now();
    try {
      const url=new URL(req.url,'http://localhost');
      const route=url.pathname, method=req.method;
      if (route.startsWith('/api/')) {
        if (!['GET','HEAD'].includes(method)) {
          if (req.headers['x-sweetmate-request']!=='1' ||
              (req.headers.origin && !settings.origins.has(req.headers.origin))) throw new ApiError(403,'Недопустимый источник запроса.');
        }
        if (route==='/api/health' && method==='GET') {
          return send(res,200,{status:'ok',search:'ready',catalogSize:search.size,demoEnabled:Boolean(settings.demoEnabled),llm:llm.configured ? 'configured' : 'not_configured'});
        }
        const demoSpace=demos.resolve(req);
        let requestDb=demoSpace?.db || db;
        let isDemo=Boolean(demoSpace);
        const requestSearch=isDemo?withDemoRecipes(search):search;
        const accountResponse=account=>({...publicAccount(account),demo:isDemo});
        const session=currentSession(requestDb,req);
        if(route==='/api/demo/login' && method==='POST') {
          limit(demoAttempts,req.socket.remoteAddress,30);
          const data=await body(req),result=await demos.login(req,data.role);
          return send(res,200,result.account,result.cookies);
        }
        const requireAccount=()=>{
          if (!session) throw new ApiError(401,'Войдите в аккаунт.');
          return session.account;
        };
        if (['/api/auth/register','/api/auth/login'].includes(route) && method==='POST') {
          limit(authAttempts,req.socket.remoteAddress,15);
          const data=await body(req),email=emailAddress(data.email);
          if (typeof data.password!=='string' || data.password.length>128 || !data.password) throw new ApiError(400,'Укажите пароль.');
          const testRole=settings.demoEnabled?demoRole(email,data.password):null;
          if(testRole) {
            if(route.endsWith('register') && data.password!==data.confirmPassword)throw new ApiError(400,'Пароли не совпадают.');
            const result=await demos.login(req,testRole);
            return send(res,200,result.account,result.cookies);
          }
          // Real forms always use the normal database, even after trying a demo.
          requestDb=db;isDemo=false;
          let account;
          if (route.endsWith('register')) {
            passwordValue(data.password);
            if (data.password!==data.confirmPassword) throw new ApiError(400,'Пароли не совпадают.');
            if (requestDb.prepare('SELECT id FROM accounts WHERE email=?').get(email)) throw new ApiError(409,'Аккаунт уже существует. Войдите или укажите другую почту.');
            const hash=await hashPassword(data.password);
            const id=randomUUID();
            try { requestDb.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?)').run(id,email,email.split('@')[0].slice(0,32),hash,'user',new Date().toISOString()); }
            catch (error) {
              if (requestDb.prepare('SELECT id FROM accounts WHERE email=?').get(email)) throw new ApiError(409,'Аккаунт уже существует.');
              throw error;
            }
            account=requestDb.prepare('SELECT * FROM accounts WHERE id=?').get(id);
          } else {
            account=requestDb.prepare('SELECT * FROM accounts WHERE email=?').get(email);
            // Equal-cost password verification even if an email is unknown.
            const valid=await verifyPassword(data.password,account?.password_hash || '00000000000000000000000000000000:'+ '00'.repeat(64));
            if (!account || !valid) throw new ApiError(401,'Неверная почта или пароль.');
          }
          return send(res,route.endsWith('register') ? 201 : 200,accountResponse(account),[sessionCookie(createSession(requestDb,account.id,settings),settings),demos.clearCookie]);
        }
        if (route==='/api/auth/me' && method==='GET') return send(res,200,accountResponse(requireAccount()));
        if (route==='/api/auth/logout' && method==='POST') {
          if (session) requestDb.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.hash);
          return send(res,204,undefined,sessionCookie('',settings));
        }
        if (route==='/api/profile' && method==='PATCH') {
          const account=requireAccount(),data=await body(req);
          if (typeof data.displayName!=='string') throw new ApiError(400,'Введите имя.');
          const name=data.displayName.trim().replace(/\s+/g,' ');
          if (!name || name.length>32) throw new ApiError(400,'Имя должно содержать от 1 до 32 символов.');
          requestDb.prepare('UPDATE accounts SET display_name=? WHERE id=?').run(name,account.id);
          return send(res,200,accountResponse(requestDb.prepare('SELECT * FROM accounts WHERE id=?').get(account.id)));
        }
        if (route==='/api/profile/password' && method==='POST') {
          const account=requireAccount(),data=await body(req);
          passwordValue(data.newPassword);
          if (data.newPassword!==data.confirmPassword) throw new ApiError(400,'Пароли не совпадают.');
          if (typeof data.currentPassword!=='string' || data.currentPassword.length>128 ||
              !await verifyPassword(data.currentPassword,account.password_hash)) throw new ApiError(400,'Текущий пароль неверен.');
          requestDb.prepare('UPDATE accounts SET password_hash=? WHERE id=?').run(await hashPassword(data.newPassword),account.id);
          requestDb.prepare('DELETE FROM sessions WHERE account_id=?').run(account.id);
          return send(res,204,undefined,sessionCookie(createSession(requestDb,account.id,settings),settings));
        }
        if (route==='/api/profile' && method==='DELETE') {
          const account=requireAccount();
          requestDb.prepare('DELETE FROM accounts WHERE id=?').run(account.id);
          return send(res,204,undefined,sessionCookie('',settings));
        }
        if (route==='/api/admin/stats' && method==='GET') {
          if (requireAccount().role!=='admin') throw new ApiError(403,'Нет доступа.');
          prune(requestDb,settings.analyticsDays);
          return send(res,200,{...snapshot(requestDb,settings.analyticsDays,requestSearch),services:{search:'ready',llm:llm.configured ? 'configured' : 'not_configured'}});
        }
        if (route==='/api/recipes/popular' && method==='GET') {
          requireAccount();
          return send(res,200,snapshot(requestDb,settings.analyticsDays,requestSearch).popular.slice(0,4));
        }
        if (route.startsWith('/api/recipes/') && method==='GET') {
          requireAccount();
          const recipe=requestSearch.recipe(decodeURIComponent(route.slice('/api/recipes/'.length)));
          if (!recipe) throw new ApiError(404,'Рецепт не найден.');
          return send(res,200,recipe);
        }
        if (route==='/api/search' && method==='POST') {
          const account=requireAccount();
          limit(searchAttempts,account.id,30);
          const data=await body(req,1024*1024);
          if (typeof data.query!=='string' || !data.query.trim() || [...data.query].length>500) throw new ApiError(400,'Введите вопрос длиной от 1 до 500 символов.');
          const query=data.query.trim(),queryId=randomUUID(),eventId=randomUUID(),submittedAt=new Date().toISOString();
          prune(requestDb,settings.analyticsDays);
          requestDb.prepare('INSERT INTO events(id,account_id,session_id,query_id,submitted_at,status) VALUES (?,?,?,?,?,?)')
            .run(eventId,account.id,session.hash,queryId,submittedAt,'processing');
          let result;
          try {
            const history=Array.isArray(data.history)?data.history.slice(-6).filter(m=>m && ['user','assistant'].includes(m.role) && typeof m.text==='string').map(m=>({role:m.role,text:m.text.slice(0,400)})):[];
            result=await converse({query,context:data.context,history,search:requestSearch,llm});
            const recipes=result.recipes || [];
            requestDb.exec('BEGIN');
            try {
              for (const recipe of recipes) requestDb.prepare('INSERT INTO result_recipes VALUES (?,?)').run(eventId,recipe.id);
              requestDb.prepare('UPDATE events SET status=?,duration_ms=? WHERE id=?').run(result.status,Date.now()-started,eventId);
              requestDb.exec('COMMIT');
            } catch(error) { requestDb.exec('ROLLBACK');throw error; }
            return send(res,200,{queryId,...result});
          } catch(error) {
            requestDb.prepare("UPDATE events SET status='error',duration_ms=? WHERE id=?").run(Date.now()-started,eventId);
            throw error;
          }
        }
        throw new ApiError(404,'Адрес не найден.');
      }
      if (method!=='GET' && method!=='HEAD') throw new ApiError(405,'Метод не поддерживается.');
      const base=path.join(ROOT,'sweetmate-frontend/dist');
      let file=path.resolve(base,'.'+decodeURIComponent(url.pathname));
      if (file!==base && !file.startsWith(base+path.sep)) throw new ApiError(404,'Страница не найдена.');
      try { if ((await stat(file)).isDirectory()) file=path.join(file,'index.html'); }
      catch {
        if (path.extname(file)) throw new ApiError(404,'Файл не найден.');
        file=path.join(base,'index.html');
      }
      const data=await readFile(file);
      res.writeHead(200,{'Content-Type':MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control':path.extname(file)==='.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin',
        'Content-Security-Policy':"default-src 'self'; img-src 'self' data: https://povarenok.ru https://www.povarenok.ru; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"});
      res.end(method==='HEAD' ? undefined : data);
    } catch(error) {
      if (!res.headersSent) send(res,error instanceof ApiError ? error.status : 500,
        {message:error instanceof ApiError ? error.message : 'Сервис временно недоступен. Повторите запрос позже.'});
      else res.end();
    }
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  return {server,db,close:()=>new Promise(resolve=>server.close(()=>{demos.close();db.close();resolve();}))};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const settings=config();
  const app=await createApp({settings});
  app.server.listen(settings.port,settings.host,()=>console.log('SweetMate: http://localhost:'+settings.port));
  for (const signal of ['SIGTERM','SIGINT']) process.once(signal,()=>app.close().then(()=>process.exit(0)));
}
