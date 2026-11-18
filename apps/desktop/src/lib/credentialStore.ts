const SESSION_TOKEN_KEY = 'ar_payroll_session_token';
let volatileMemoryToken: string | null = null;

export async function saveSessionTokenSecure(token: string): Promise<void> {
  volatileMemoryToken = token;
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
}

export async function getSessionTokenSecure(): Promise<string | null> {
  if (volatileMemoryToken) return volatileMemoryToken;
  const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
  volatileMemoryToken = token;
  return token;
}

export async function clearSessionTokenSecure(): Promise<void> {
  volatileMemoryToken = null;
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
}
