const attempts = new Map<string, { count: number; blockedUntil: number }>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export function checkRateLimit(key: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (entry && entry.blockedUntil > now) {
    return { allowed: false, retryAfter: Math.ceil((entry.blockedUntil - now) / 1000) };
  }

  if (entry && entry.blockedUntil <= now) {
    attempts.delete(key);
  }

  return { allowed: true };
}

export function recordFailedAttempt(key: string): { blocked: boolean; retryAfter?: number } {
  const now = Date.now();
  let entry = attempts.get(key);

  if (entry && entry.blockedUntil <= now) {
    attempts.delete(key);
    entry = undefined;
  }

  if (!entry) {
    entry = { count: 0, blockedUntil: 0 };
  }

  entry.count += 1;

  if (entry.count >= MAX_ATTEMPTS) {
    entry.blockedUntil = now + WINDOW_MS;
    attempts.set(key, entry);
    return { blocked: true, retryAfter: Math.ceil(WINDOW_MS / 1000) };
  }

  attempts.set(key, entry);
  return { blocked: false };
}

export function recordSuccessfulLogin(key: string): void {
  attempts.delete(key);
}
