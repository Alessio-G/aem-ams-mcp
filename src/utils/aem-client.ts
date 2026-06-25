import { AEMFetch } from '../aem/aem.fetch.js';

/**
 * Thin helpers over the existing authenticated {@link AEMFetch} client.
 *
 * These intentionally do NOT construct their own client or read an AEM_HOST env
 * var — the host, auth (OAuth S2S / Basic), 401-retry and timeout are all owned
 * by the {@link AEMFetch} instance held privately by `AEMConnector`. Each helper
 * is therefore called from inside a connector method, which passes `this.fetch`.
 */

/** GET a JCR path that returns JSON (e.g. `${path}.infinity.json`). */
export async function aemGetJson(
  fetch: AEMFetch,
  path: string,
  params?: Record<string, any>,
): Promise<any> {
  return fetch.get(path, params);
}

/** GET a JCR path that returns raw text (e.g. a clientlib `.css` file). */
export async function aemGetText(fetch: AEMFetch, path: string): Promise<string> {
  return fetch.get(path, undefined, {}, undefined, /* isHtml */ true);
}

/** POST form-encoded fields to the Sling POST servlet (e.g. property updates). */
export async function aemPostForm(
  fetch: AEMFetch,
  path: string,
  form: Record<string, string>,
): Promise<any> {
  const body = new URLSearchParams();
  Object.entries(form).forEach(([k, v]) => body.append(k, v));
  return fetch.post(path, body, { headers: { Accept: 'application/json' } });
}

/** PUT a JSON body (used by the Assets HTTP API for content-fragment updates). */
export async function aemPutJson(fetch: AEMFetch, path: string, body: unknown): Promise<any> {
  return fetch.put(path, body);
}

/**
 * POST raw file content (verbatim body + explicit Content-Type) to a JCR path.
 * Returns the raw Response so the caller can check status / report bytes written.
 */
export async function aemPostFile(
  fetch: AEMFetch,
  path: string,
  body: string,
  contentType: string,
): Promise<Response> {
  return fetch.postRaw(path, body, contentType);
}
