/// <reference types="vite/client" />
const API_BASE = import.meta.env.PUBLIC_API_BASE || "/api";

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...init,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export interface AuthMe {
  authenticated: boolean;
  email: string;
  userId: string;
}

export async function getAuthMe(): Promise<AuthMe | null> {
  const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`Auth check failed: ${res.status}`);
  return res.json();
}

export async function sendMagicLink(email: string): Promise<void> {
  const res = await fetch(`${API_BASE}/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error("Could not send sign-in link.");
}
