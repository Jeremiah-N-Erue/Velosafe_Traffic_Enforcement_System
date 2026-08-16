const TOKEN_KEY = "velosafe_token";

// In local dev, Vite proxies "/api" to the backend (see vite.config.ts).
// In production, the frontend and backend are typically deployed as separate
// services, so VITE_API_URL must be set at build time to the backend's full
// URL (e.g. "https://velosafe-backend.onrender.com/api").
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") || "/api";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 204) {
    return undefined as T;
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const message = typeof body === "object" && body && "error" in body ? String((body as any).error) : "Request failed";
    if (res.status === 401) {
      clearToken();
    }
    throw new ApiError(res.status, message, (body as any)?.details);
  }

  return body as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "POST", body: data !== undefined ? JSON.stringify(data) : undefined }),
  patch: <T>(path: string, data?: unknown) =>
    request<T>(path, { method: "PATCH", body: data !== undefined ? JSON.stringify(data) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  // Evidence files are served behind auth, so a plain <img src="..."> can't fetch them directly —
  // this fetches the bytes with the Authorization header and hands back an object URL to use as
  // an <img>/<video> src. Caller is responsible for URL.revokeObjectURL when done with it.
  async getObjectUrl(path: string): Promise<string> {
    const token = getToken();
    const headers = new Headers();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) throw new ApiError(res.status, "Couldn't load file");
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },
};

/** Reads a File as a base64 string suitable for the evidence upload payload. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
