export type Account = { id: string; email: string; displayName: string; role: 'user' | 'admin'; demo?: boolean };
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api' + path, { ...options, credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-SweetMate-Request': '1', ...options.headers } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError(0, 'Не удалось связаться с сервером. Проверьте подключение и повторите запрос.');
  }
  if (response.status === 204) return undefined as T;
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError(response.status, 'Сервер вернул некорректный ответ.'); }
  if (!response.ok) throw new ApiError(response.status, data.message || 'Не удалось выполнить действие.');
  return data as T;
}
