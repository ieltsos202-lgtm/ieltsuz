import { supabase } from "./supabase";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export const API_BASE = API_URL;

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};
}

export async function apiGet<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, { headers });
  if (!res.ok) throw new Error(await readError(res, `GET ${path}`));
  return res.json();
}

async function readError(res: Response, path: string): Promise<string> {
  try {
    const data = await res.json();
    return data.detail || data.error || `${path} failed: ${res.status}`;
  } catch {
    return `${path} failed: ${res.status}`;
  }
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `POST ${path}`));
  return res.json();
}

/**
 * Like apiPost, but for endpoints that return raw binary (e.g. TTS audio)
 * instead of JSON. Returns a Blob the caller can play directly via
 * URL.createObjectURL — no JSON parsing or base64 decoding needed.
 */
export async function apiPostBinary(path: string, body: unknown): Promise<Blob> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `POST ${path}`));
  return res.blob();
}

/**
 * Like apiPostBinary but returns the raw Response so the caller can consume
 * `res.body` as a stream (e.g. progressive audio playback via MediaSource).
 */
export async function apiPostStream(path: string, body: unknown): Promise<Response> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `POST ${path}`));
  return res;
}

export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `PATCH ${path}`));
  return res.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res, `PUT ${path}`));
  return res.json();
}

export async function apiDelete<T>(path: string): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error(await readError(res, `DELETE ${path}`));
  return res.json();
}

export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  const headers = await authHeader();
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers, // do NOT set Content-Type; the browser sets the multipart boundary
    body: form,
  });
  if (!res.ok) throw new Error(await readError(res, `POST ${path}`));
  return res.json();
}
