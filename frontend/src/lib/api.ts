const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...options?.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // Pilot's proxy routes wrap upstream errors as { error: "..." };
    // some backends use { message: "..." }. Fall back in that order so
    // actionable server messages (e.g. "Connect your GitHub account")
    // reach the UI instead of a generic "API error: 403".
    throw new Error(body.error || body.message || `API error: ${res.status}`);
  }

  return res.json();
}
