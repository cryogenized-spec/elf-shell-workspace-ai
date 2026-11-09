// Development-only, one-account session source. Not OAuth, and not browser storage.
export const TASKS_READ = "https://www.googleapis.com/auth/tasks.readonly";
export const TASKS_WRITE = "https://www.googleapis.com/auth/tasks";

export class AccessError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function createEnvironmentSessions(env = process.env) {
  const accountId = env.ELFSHELL_GOOGLE_ACCOUNT || "default";
  return {
    async get(requestedId) {
      if (requestedId !== accountId) throw new AccessError("UNKNOWN_GOOGLE_ACCOUNT");
      const accessToken = env.ELFSHELL_GOOGLE_ACCESS_TOKEN;
      const scopes = (env.ELFSHELL_GOOGLE_SCOPES || "").split(/\s+/).filter(Boolean);
      const expiresAt = Date.parse(env.ELFSHELL_GOOGLE_TOKEN_EXPIRES_AT || "");
      if (!accessToken || !Number.isFinite(expiresAt))
        throw new AccessError("GOOGLE_SESSION_NOT_CONFIGURED");
      if (expiresAt <= Date.now() + 5000)
        throw new AccessError("GOOGLE_SESSION_EXPIRED");
      return {accessToken, scopes, expiresAt};
    }
  };
}

export async function requireSession(sessions, accountId, write = false, now = Date.now()) {
  if (typeof accountId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(accountId))
    throw new AccessError("INVALID_ACCOUNT_ID");
  const session = await sessions.get(accountId);
  if (!session || typeof session.accessToken !== "string" ||
      session.accessToken.length < 8 || !Array.isArray(session.scopes) ||
      !Number.isFinite(session.expiresAt))
    throw new AccessError("GOOGLE_SESSION_NOT_CONFIGURED");
  if (session.expiresAt <= now + 5000) throw new AccessError("GOOGLE_SESSION_EXPIRED");
  if (!(write ? session.scopes.includes(TASKS_WRITE)
      : (session.scopes.includes(TASKS_WRITE) || session.scopes.includes(TASKS_READ))))
    throw new AccessError("GOOGLE_TASKS_SCOPE_MISSING");
  return session.accessToken;
}
