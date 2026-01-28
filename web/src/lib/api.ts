// web/src/lib/api.ts
const RAW = (import.meta.env.VITE_API_URL || "http://localhost:4000") as string;

export const API_BASE = RAW.replace(/\/+$/, "");
export const apiBase = API_BASE;

function getToken() {
  return localStorage.getItem("gc_token") || "";
}

function authHeaders(): Record<string, string> {
  const t = getToken();
  if (!t || t === "undefined" || t === "null") return {};
  return { Authorization: `Bearer ${t}` };
}

async function safeJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(options.headers as any),
    },
  });

  const body = await safeJson(res);

  if (!res.ok) {
    const msg =
      typeof body === "string"
        ? body
        : (body as any)?.error || (body as any)?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return body as T;
}

export const api = {
  get: <T = any>(path: string, opts: RequestInit = {}) => apiFetch<T>(path, { ...opts, method: "GET" }),
  post: <T = any>(path: string, body?: any, opts: RequestInit = {}) =>
    apiFetch<T>(path, { ...opts, method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  put: <T = any>(path: string, body?: any, opts: RequestInit = {}) =>
    apiFetch<T>(path, { ...opts, method: "PUT", body: body !== undefined ? JSON.stringify(body) : undefined }),
  del: <T = any>(path: string, opts: RequestInit = {}) => apiFetch<T>(path, { ...opts, method: "DELETE" }),
};

export default api;
