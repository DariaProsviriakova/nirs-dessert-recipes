import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(scryptCallback);
export const digest = value => createHash('sha256').update(value).digest('hex');
export const publicAccount = a => ({id:a.id,email:a.email,displayName:a.display_name,role:a.role});
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function emailAddress(value) {
  if (typeof value !== 'string') throw new ApiError(400,'Укажите электронную почту.');
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(400,'Проверьте формат электронной почты.');
  return email;
}
export function passwordValue(value) {
  if (typeof value !== 'string' || value.length < 6 || value.length > 128) throw new ApiError(400,'Пароль должен содержать от 6 до 128 символов.');
  return value;
}
export async function hashPassword(password) {
  const salt=randomBytes(16).toString('hex');
  return salt+':'+Buffer.from(await scrypt(password,salt,64)).toString('hex');
}
export async function verifyPassword(password, stored) {
  const [salt,hash]=stored.split(':');
  const actual=Buffer.from(await scrypt(password,salt,64));
  return timingSafeEqual(actual,Buffer.from(hash,'hex'));
}
export async function bootstrapAdmin(db, settings) {
  if (!settings.adminEmail && !settings.adminPassword) return;
  const email=emailAddress(settings.adminEmail), password=passwordValue(settings.adminPassword);
  // Never change credentials or roles of an existing account implicitly.
  const existing=db.prepare('SELECT role FROM accounts WHERE email=?').get(email);
  if (existing) {
    if (existing.role!=='admin') throw new Error('ADMIN_EMAIL already belongs to a user; choose another address.');
    return;
  }
  db.prepare('INSERT INTO accounts VALUES (?,?,?,?,?,?)').run(randomUUID(),email,'Администратор',await hashPassword(password),'admin',new Date().toISOString());
}
export function createSession(db, accountId, settings) {
  const token=randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(digest(token),accountId,new Date(Date.now()+settings.sessionDays*86400000).toISOString());
  return token;
}
export function sessionCookie(token, settings) {
  return `sweetmate_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? settings.sessionDays*86400 : 0}${settings.secure ? '; Secure' : ''}`;
}
export function currentSession(db, req) {
  const token=(req.headers.cookie || '').split(';').map(s=>s.trim()).find(s=>s.startsWith('sweetmate_session='))?.slice(18);
  if (!token || token.length>128) return null;
  const hash=digest(token);
  const account=db.prepare(`SELECT a.* FROM accounts a JOIN sessions s ON a.id=s.account_id
    WHERE s.token_hash=? AND s.expires_at>?`).get(hash,new Date().toISOString());
  return account ? {account, hash} : null;
}
