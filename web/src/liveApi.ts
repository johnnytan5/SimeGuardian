import { useCallback, useEffect, useState } from "react";

// Calls the live phone demo engine (server/, port 4000) through the Vite proxy at /live-api.
export async function live<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/live-api${path}`, body === undefined ? { cache: "no-store" } : {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Live demo server returned ${response.status}`);
  return response.json() as Promise<T>;
}

export function usePoll<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setData(await live<T>(path));
      setError("");
    } catch {
      setError("Can't reach the live demo server. Start it with “cd server && npm start” (port 4000).");
    }
  }, [path]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 1000);
    return () => clearInterval(timer);
  }, [load]);
  return { data, error, load };
}
