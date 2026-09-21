/**
 * API configuration smoke test (caregiver portal).
 *
 * Verifies the static contract between the SPA's API client
 * (src/services/api.ts), the production express server (server.js) and the
 * vite dev proxy (vite.config.ts):
 *
 *  - the axios client is rooted at `${VITE_API_URL}/api`
 *  - JSON content-type and credentialed requests are the defaults
 *  - server.js proxies /api to the same API_URL the client expects
 *
 * Runs on the Node built-in test runner — no extra dependencies:
 *   npm test   (node --test tests/)
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

describe('caregiver-portal API configuration', () => {
  it('axios client baseURL is ${VITE_API_URL}/api', () => {
    const api = read('src/services/api.ts');
    assert.match(
      api,
      /baseURL:\s*`?\$\{import\.meta\.env\.VITE_API_URL[^`]*\}\/api`?/,
      'expected baseURL built from VITE_API_URL with an /api suffix',
    );
  });

  it('axios client sends JSON and includes credentials by default', () => {
    const api = read('src/services/api.ts');
    assert.match(api, /'Content-Type':\s*'application\/json'/);
    assert.match(api, /withCredentials:\s*true/);
  });

  it('auth token is attached as a Bearer header', () => {
    const api = read('src/services/api.ts');
    assert.match(api, /Authorization.*Bearer/i);
  });

  it('server.js proxies /api to API_URL for the production build', () => {
    const server = read('server.js');
    assert.match(server, /process\.env\.API_URL/);
    assert.match(server, /['"]\/api['"]/);
    assert.match(server, /createProxyMiddleware|proxy/);
  });

  it('vite dev proxy targets the same VITE_API_URL', () => {
    const vite = read('vite.config.ts');
    assert.match(vite, /VITE_API_URL/);
    assert.match(vite, /['"]\/api['"]\s*:/);
  });
});
