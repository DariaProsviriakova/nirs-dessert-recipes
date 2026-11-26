import path from 'node:path';
import { fileURLToPath } from 'node:url';
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function config(env = process.env) {
  const positive = (key, fallback, max) => {
    const n = Number(env[key] || fallback);
    if (!Number.isInteger(n) || n < 1 || n > max) throw new Error('Invalid ' + key);
    return n;
  };
  return {
    demoEnabled: env.DEMO_MODE !== 'false',
    authAttemptsPerMinute: positive('AUTH_RATE_LIMIT', 15, 1000),
    host: env.HOST || '127.0.0.1', port: positive('PORT', 8000, 65535),
    dbPath: path.resolve(ROOT, env.DB_PATH || 'backend/.data/sweetmate.sqlite'),
    indexPath: path.resolve(ROOT, env.INDEX_PATH || 'bm25/data/generated/bm25-index.json.gz'),
    origins: new Set((env.APP_ORIGINS || 'http://localhost:8000,http://127.0.0.1:8000,http://localhost:5173,http://127.0.0.1:5173').split(',').map(s => s.trim())),
    sessionDays: positive('SESSION_DAYS', 7, 365),
    analyticsDays: positive('ANALYTICS_DAYS', 90, 3650),
    secure: env.COOKIE_SECURE === 'true',
    adminEmail: (env.ADMIN_EMAIL || '').trim().toLowerCase(), adminPassword: env.ADMIN_PASSWORD || '',
    llmProvider: env.LLM_PROVIDER || 'none', llmKey: env.LLM_API_KEY || '',
    llmModel: env.LLM_MODEL || 'GigaChat-2',
    llmBase: env.LLM_BASE_URL || 'https://api.giga.chat/v1',
    caFile: env.LLM_CA_FILE ? path.resolve(ROOT,env.LLM_CA_FILE) : null,
    authUrl: env.GIGACHAT_AUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth',
    scope: env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS',
    timeout: positive('LLM_TIMEOUT_MS', 20000, 120000),
  };
}
