// The player token lives in sessionStorage: it survives a reload but is private to
// one tab, so four tabs of one browser can be four different players.
// Storage access can throw (disabled storage, private mode), which is treated as "no token".

const key = (code: string) => `beer:${code}`;

export function getToken(code: string): string | null {
  try {
    return sessionStorage.getItem(key(code));
  } catch {
    return null;
  }
}

export function saveToken(code: string, token: string): void {
  try {
    sessionStorage.setItem(key(code), token);
  } catch {
    // Still playable until the next reload.
  }
}
