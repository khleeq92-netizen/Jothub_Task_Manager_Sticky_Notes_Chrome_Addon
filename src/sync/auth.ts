import { getLocal, removeLocal, setLocal } from '../core/db';
import { uid } from '../core/types';
import { platform } from '../platform';
import { getCloudConfig, type CloudConfig } from './config';

// Firebase Authentication through its REST API. No remote scripts are loaded
// (a Manifest V3 requirement) and the same code runs in a page or the
// service worker, in any browser.

export interface AuthState {
  uid: string;
  email: string;
  provider: 'password' | 'google';
  idToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface PublicAuth {
  uid: string;
  email: string;
  provider: AuthState['provider'];
}

let fetchImpl: typeof fetch = (...args) => fetch(...args);
/** Tests replace the network. */
export const setAuthFetch = (f: typeof fetch) => (fetchImpl = f);

const MESSAGES: Record<string, string> = {
  EMAIL_EXISTS: 'An account with this email already exists. Sign in instead.',
  EMAIL_NOT_FOUND: 'Email or password is incorrect.',
  INVALID_PASSWORD: 'Email or password is incorrect.',
  INVALID_LOGIN_CREDENTIALS: 'Email or password is incorrect.',
  INVALID_EMAIL: 'That email address does not look right.',
  MISSING_PASSWORD: 'Enter a password.',
  WEAK_PASSWORD: 'Choose a password with at least 6 characters.',
  USER_DISABLED: 'This account has been disabled.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Try again in a few minutes.',
  OPERATION_NOT_ALLOWED: 'This sign-in method is not enabled in your Firebase project.',
  CONFIGURATION_NOT_FOUND: 'Authentication is not enabled in your Firebase project yet.',
  API_KEY_INVALID: 'The Firebase API key is not valid. Check Settings → Cloud sync.',
};

function friendly(raw: string | undefined, status: number): string {
  const code = (raw ?? '').split(/[ :]/)[0];
  if (MESSAGES[code]) return MESSAGES[code];
  if (/API key not valid/i.test(raw ?? '')) return MESSAGES.API_KEY_INVALID;
  return raw ? `Sign-in failed: ${raw}` : `Sign-in failed (${status}).`;
}

async function requireConfig(): Promise<CloudConfig> {
  const config = await getCloudConfig();
  if (!config) throw new Error('Cloud sync is not set up yet. Add your Firebase details in Settings → Cloud sync.');
  return config;
}

async function identity(method: string, body: object): Promise<any> {
  const config = await requireConfig();
  const res = await fetchImpl(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(friendly(data?.error?.message, res.status));
  return data;
}

async function store(data: any, provider: AuthState['provider']): Promise<PublicAuth> {
  const auth: AuthState = {
    uid: data.localId,
    email: data.email ?? '',
    provider,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
    expiresAt: Date.now() + Number(data.expiresIn ?? 3600) * 1000,
  };
  await setLocal('auth', auth);
  return { uid: auth.uid, email: auth.email, provider };
}

export const signUpWithEmail = async (email: string, password: string) =>
  store(await identity('signUp', { email, password, returnSecureToken: true }), 'password');

export const signInWithEmail = async (email: string, password: string) =>
  store(await identity('signInWithPassword', { email, password, returnSecureToken: true }), 'password');

export const sendPasswordReset = (email: string) => identity('sendOobCode', { requestType: 'PASSWORD_RESET', email });

export async function signInWithGoogle(): Promise<PublicAuth> {
  const config = await requireConfig();
  if (!config.googleClientId) throw new Error('Add a Google OAuth client ID in Settings → Cloud sync to use Google sign-in.');
  const redirect = platform.identity.redirectUrl();
  const url =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    new URLSearchParams({
      client_id: config.googleClientId,
      response_type: 'id_token',
      redirect_uri: redirect,
      scope: 'openid email profile',
      nonce: uid(),
      prompt: 'select_account',
    });
  const result = await platform.identity.authFlow(url);
  const params = new URLSearchParams(new URL(result).hash.slice(1));
  const idToken = params.get('id_token');
  if (!idToken) throw new Error(params.get('error_description') || params.get('error') || 'Google did not return a sign-in token.');
  const data = await identity('signInWithIdp', {
    postBody: `id_token=${encodeURIComponent(idToken)}&providerId=google.com`,
    requestUri: redirect,
    returnSecureToken: true,
    returnIdpCredential: true,
  });
  return store(data, 'google');
}

/** Signing out only forgets the session. Everything stored on this device stays. */
export async function signOut(): Promise<void> {
  await removeLocal('auth');
  await removeLocal('syncState');
  await setLocal('syncStatus', { state: 'off' });
}

export async function getAuth(): Promise<PublicAuth | null> {
  const auth = await getLocal<AuthState | null>('auth', null);
  return auth ? { uid: auth.uid, email: auth.email, provider: auth.provider } : null;
}

let refreshing: Promise<string> | null = null;

/** A valid ID token, refreshed when it is about to expire. */
export async function getIdToken(): Promise<string> {
  const auth = await getLocal<AuthState | null>('auth', null);
  if (!auth) throw new Error('Not signed in.');
  if (auth.expiresAt - 60000 > Date.now()) return auth.idToken;
  refreshing ??= refresh(auth).finally(() => (refreshing = null));
  return refreshing;
}

async function refresh(auth: AuthState): Promise<string> {
  const config = await requireConfig();
  const res = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(config.apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: auth.refreshToken }).toString(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const code = data?.error?.message ?? '';
    if (/TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_GRANT/.test(code)) {
      await signOut();
      throw new Error('Your session has ended. Sign in again to keep syncing.');
    }
    throw new Error(friendly(code, res.status));
  }
  const next: AuthState = { ...auth, idToken: data.id_token, refreshToken: data.refresh_token ?? auth.refreshToken, expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000 };
  await setLocal('auth', next);
  return next.idToken;
}
