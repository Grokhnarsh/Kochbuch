/**
 * Duenner fetch-Aufsatz mit Zeitlimit und verstaendlichen Fehlern.
 * Optional laesst sich ein Proxy vorschalten, wenn eine Quelle keine
 * CORS-Freigabe liefert (im Browser der Regelfall bei Rezeptseiten).
 */

export class SourceError extends Error {
  constructor(message, { cause, kind = 'network' } = {}) {
    super(message);
    this.name = 'SourceError';
    this.kind = kind;
    this.cause = cause;
  }
}

/** Basis-URL eines optionalen CORS-Proxys, z. B. "https://mein-proxy/?url=". */
export let proxyBase = '';

export function setProxyBase(base) {
  proxyBase = base || '';
}

function viaProxy(url) {
  if (!proxyBase) return url;
  return proxyBase.includes('{url}')
    ? proxyBase.replace('{url}', encodeURIComponent(url))
    : proxyBase + encodeURIComponent(url);
}

export async function getJSON(url, { timeout = 12000, useProxy = false } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(useProxy ? viaProxy(url) : url, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new SourceError(`Quelle antwortete mit ${res.status}`, { kind: 'http' });
    }
    return await res.json();
  } catch (err) {
    if (err instanceof SourceError) throw err;
    if (err.name === 'AbortError') {
      throw new SourceError('Zeitlimit überschritten', { cause: err, kind: 'timeout' });
    }
    throw new SourceError(
      'Nicht erreichbar — meist blockiert die Seite Browser-Zugriffe (CORS) oder das Netz ist gesperrt.',
      { cause: err, kind: 'cors' },
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function getText(url, { timeout = 15000, useProxy = true } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(useProxy ? viaProxy(url) : url, { signal: ctrl.signal });
    if (!res.ok) throw new SourceError(`Seite antwortete mit ${res.status}`, { kind: 'http' });
    return await res.text();
  } catch (err) {
    if (err instanceof SourceError) throw err;
    throw new SourceError(
      'Seite nicht abrufbar — Rezeptseiten erlauben selten direkten Browser-Zugriff (CORS).',
      { cause: err, kind: 'cors' },
    );
  } finally {
    clearTimeout(timer);
  }
}
