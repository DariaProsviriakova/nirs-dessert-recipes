import {randomBytes} from 'node:crypto';
import {openStore} from './store.mjs';
import {hashPassword,createSession,sessionCookie,publicAccount,ApiError} from './auth.mjs';

export const DEMO_ACCOUNTS={
 user:{email:'user@sweetmate.test',password:'user123',name:'Тестовый пользователь'},
 admin:{email:'admin@sweetmate.test',password:'admin123',name:'Администратор'},
};
export function demoRole(email,password) {
 return Object.entries(DEMO_ACCOUNTS).find(([,a])=>a.email===email && a.password===password)?.[0] || null;
}
export function demoSpaces(settings) {
 const spaces=new Map(), lifetime=6*60*60*1000;
 const cookie=token=>'sweetmate_demo_space='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+Math.floor(lifetime/1000)+(settings.secure?'; Secure':'');
 const clearCookie='sweetmate_demo_space=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'+(settings.secure?'; Secure':'');
 function resolve(req) {
  if(!settings.demoEnabled)return null;
  const token=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('sweetmate_demo_space='))?.slice(21);
  const space=spaces.get(token);
  if(!space)return null;
  if(space.expires<Date.now()) {space.db.close();spaces.delete(token);return null;}
  space.expires=Date.now()+lifetime;
  return {token,...space};
 }
 return {resolve,clearCookie,close(){for(const s of spaces.values())s.db.close();spaces.clear();},
  async login(req,role) {
   if(!settings.demoEnabled)throw new ApiError(404,'Тестовый режим отключён.');
   const profile=DEMO_ACCOUNTS[role];
   if(!profile)throw new ApiError(400,'Выберите тестового пользователя или администратора.');
   let space=resolve(req);
   if(!space) {
    for(const [token,s] of spaces)if(s.expires<Date.now()){s.db.close();spaces.delete(token);}
    if(spaces.size>=100)throw new ApiError(429,'Слишком много тестовых сеансов. Повторите позже.');
    const token=randomBytes(32).toString('base64url'),db=openStore(':memory:');
    space={token,db,expires:Date.now()+lifetime};spaces.set(token,space);
   }
   let account=space.db.prepare('SELECT * FROM accounts WHERE email=?').get(profile.email);
   if(!account) {
    const id=randomBytes(16).toString('hex');
    space.db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?)').run(id,profile.email,profile.name,await hashPassword(profile.password),role,new Date().toISOString());
    account=space.db.prepare('SELECT * FROM accounts WHERE id=?').get(id);
   }
   return {account:{...publicAccount(account),demo:true},
     cookies:[cookie(space.token),sessionCookie(createSession(space.db,account.id,settings),settings)]};
  },
 };
}
