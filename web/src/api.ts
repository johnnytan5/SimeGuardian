export type Run = {
  id: string;
  name: string;
  status: string;
  started_at: number;
  finished_at: number | null;
  parameters: Record<string, string>;
  metrics: Record<string, number>;
  tags: Record<string, string>;
};
export type ModelVersion = {
  version: string;
  run: Run;
  aliases: string[];
  can_promote: boolean;
  comparable: boolean;
  gate_reason: string;
};
export type Job = {
  id: string;
  status: string;
  parameters: Record<string, string | number>;
  created_at: number;
  finished_at: number | null;
  result: null | { run_id: string; model_version: string }[];
  error: string | null;
};
export type Snapshot = {
  model_name: string;
  aliases: Record<string, string>;
  versions: ModelVersion[];
  runs: Run[];
  jobs: Job[];
  tracking_status: string;
  scope: string;
  history_limit: number;
};
export type RunDetail = Run & {
  artifacts: Record<string, Record<string, unknown>>;
};

let token: string | null = null;
export type Role = "operator" | "responder";
export const getRole = (): Role =>
  sessionStorage.getItem("simeguardian-role") === "responder"
    ? "responder"
    : "operator";
export function switchRole(role: Role) {
  token = null;
  sessionStorage.setItem("simeguardian-role", role);
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  if (!token) {
    const response = await fetch(`/api/session?role=${getRole()}`, {
      cache: "no-store",
    });
    if (!response.ok)
      throw new Error("Could not open the local operator session.");
    token = (await response.json()).token;
  }
  const response = await fetch(path, {
    ...options,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  if (response.status === 401 && !retried) {
    token = null;
    return api<T>(path, options, true);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof data.detail === "string"
        ? data.detail
        : "The request failed. Check the inputs and retry.",
    );
  }
  return data as T;
}
