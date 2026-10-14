import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { apiBaseUrl, sessionCookieName } from './config';
import { clearSession, loadSession, saveSession, type CurrentUser, type StoredSession } from './sessionStore';

WebBrowser.maybeCompleteAuthSession();

export type SignInResult =
  | { type: 'success'; session: StoredSession }
  | { type: 'cancel' }
  | { type: 'error'; code: string };

export async function restoreSession(): Promise<StoredSession | null> {
  const stored = await loadSession();
  if (!stored) {
    return null;
  }
  const user = await fetchCurrentUser(stored.sessionId);
  if (user === 'unauthorized') {
    await clearSession();
    return null;
  }
  if (user === 'unavailable') {
    return stored;
  }
  const session = { sessionId: stored.sessionId, user };
  await saveSession(session);
  return session;
}

export async function signInWithGoogle(): Promise<SignInResult> {
  const redirect = Linking.createURL('auth');
  const start = `${apiBaseUrl}/api/v1/auth/login?appRedirect=${encodeURIComponent(redirect)}`;
  const result = await WebBrowser.openAuthSessionAsync(start, redirect);
  if (result.type !== 'success' || !result.url) {
    return { type: 'cancel' };
  }
  const error = queryParam(result.url, 'error');
  if (error) {
    return { type: 'error', code: error };
  }
  const handoff = queryParam(result.url, 'handoff');
  if (!handoff) {
    return { type: 'error', code: 'SIGN_IN_FAILED' };
  }
  const response = await fetch(`${apiBaseUrl}/api/v1/auth/session`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ handoff }),
  });
  if (!response.ok) {
    return { type: 'error', code: (await problemCode(response)) ?? 'SIGN_IN_FAILED' };
  }
  const body = (await response.json()) as { sessionId: string; user: CurrentUser };
  const session = { sessionId: body.sessionId, user: body.user };
  await saveSession(session);
  return { type: 'success', session };
}

export async function signOut(sessionId: string): Promise<'signed-out' | 'failed'> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `${sessionCookieName}=${sessionId}` },
    });
    if (response.status === 204 || response.status === 401) {
      await clearSession();
      return 'signed-out';
    }
    return 'failed';
  } catch {
    return 'failed';
  }
}

async function fetchCurrentUser(sessionId: string): Promise<CurrentUser | 'unauthorized' | 'unavailable'> {
  try {
    const response = await fetch(`${apiBaseUrl}/api/v1/me`, {
      headers: {
        Accept: 'application/json',
        Cookie: `${sessionCookieName}=${sessionId}`,
      },
    });
    if (response.status === 401) {
      return 'unauthorized';
    }
    if (!response.ok) {
      return 'unavailable';
    }
    return (await response.json()) as CurrentUser;
  } catch {
    return 'unavailable';
  }
}

async function problemCode(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { code?: string };
    return body.code ?? null;
  } catch {
    return null;
  }
}

function queryParam(url: string, name: string): string | null {
  const match = new RegExp(`[?&]${name}=([^&#]*)`).exec(url);
  return match ? decodeURIComponent(match[1]) : null;
}
