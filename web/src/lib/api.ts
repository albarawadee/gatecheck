const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

export function apiBase() {
  return API;
}

export async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers || {}),
    },
    credentials: "include",
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    body: form,
    credentials: "include",
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(msg || `HTTP ${res.status}`);
  }

  return res.json();
}
