// Playwright UI smoke across admin (3040), caregiver (3030), mobile web (3020).
// Seeds data via the gateway API, then drives each surface in a real browser.
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHOTS = path.join(__dirname, 'screenshots');

const GW = 'http://localhost:3021';
const ADMIN_URL = 'http://localhost:3040';
const CARE_URL = 'http://localhost:3030';
const MOBILE_URL = 'http://localhost:3020';

const ts = Date.now();
const patientEmail = `ui-patient-${ts}@karuna.test`;
const caregiverEmail = `ui-caregiver-${ts}@karuna.test`;
const PW = 'TestPass123!';
const ADMIN_EMAIL = 'admin@karuna.com';
const ADMIN_PW = 'KarunaAdmin#2026';

let pass = 0, fail = 0;
const lines = [];
const ok = (n, c, d = '') => { if (c) { pass++; lines.push(`  PASS  ${n}`); } else { fail++; lines.push(`  FAIL  ${n}   ${d}`); } };

async function api(method, p, { token, body, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (admin) headers['X-Requested-With'] = 'XMLHttpRequest';
  const res = await fetch(GW + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

async function seed() {
  let r = await api('POST', '/api/care/auth/register', { body: { email: patientEmail, password: PW, name: 'UI Patient' } });
  const tokenP = r.data?.token;
  r = await api('POST', '/api/care/circles', { token: tokenP, body: { name: 'UI Family Circle', elderlyName: 'Grandma Mary' } });
  const circleId = r.data?.circle?.id;
  await api('POST', `/api/care/circles/${circleId}/vault/medications`, { token: tokenP, body: { name: 'Metformin', dosage: '500mg', frequency: 'twice daily', timing: ['08:00', '20:00'] } });
  r = await api('POST', `/api/care/circles/${circleId}/invite`, { token: tokenP, body: { email: caregiverEmail, role: 'caregiver' } });
  const inviteToken = r.data?.invitation?.inviteLink?.split('/').pop();
  await api('POST', `/api/care/invitations/${inviteToken}/accept`, { body: { password: PW } });
  // Grant consent so the caregiver UI can show health data
  await api('PUT', `/api/care/circles/${circleId}/consent`, { token: tokenP, body: { consent: { globalDataSharing: true, consents: [{ category: 'health_data', grantee: 'caregiver_member', accessLevel: 'read' }] } } });
  return { circleId };
}

async function login(page, url, email, password) {
  await page.goto(url + '/login', { waitUntil: 'domcontentloaded' });
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  // success = navigation away from /login
  await page.waitForFunction(() => !location.pathname.toLowerCase().includes('login'), null, { timeout: 15000 });
}

(async () => {
  const { circleId } = await seed();
  ok('API seed (patient+circle+med+caregiver+consent)', !!circleId, `circleId=${circleId}`);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // ---- ADMIN ----
  try {
    await login(page, ADMIN_URL, ADMIN_EMAIL, ADMIN_PW);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'admin-dashboard.png'), fullPage: true });
    const body = (await page.textContent('body')) || '';
    ok('Admin login -> dashboard renders', !/Enter your email/.test(body) && body.length > 200, `url=${page.url()}`);
    // Users page
    await page.goto(ADMIN_URL + '/users', { waitUntil: 'networkidle' }).catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'admin-users.png'), fullPage: true });
    const ub = (await page.textContent('body')) || '';
    ok('Admin Users page shows seeded patient', ub.includes(patientEmail), `patient not found on users page`);
  } catch (e) { ok('Admin flow', false, String(e).slice(0, 160)); await page.screenshot({ path: path.join(SHOTS, 'admin-FAIL.png') }).catch(() => {}); }

  // ---- CAREGIVER ----
  try {
    await ctx.clearCookies();
    await login(page, CARE_URL, caregiverEmail, PW);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.screenshot({ path: path.join(SHOTS, 'caregiver-dashboard.png'), fullPage: true });
    const body = (await page.textContent('body')) || '';
    ok('Caregiver login -> dashboard renders', !/Enter your password/.test(body) && body.length > 200, `url=${page.url()}`);
    ok('Caregiver dashboard shows the circle', /UI Family Circle|Grandma Mary/.test(body), 'circle name not visible');
  } catch (e) { ok('Caregiver flow', false, String(e).slice(0, 160)); await page.screenshot({ path: path.join(SHOTS, 'caregiver-FAIL.png') }).catch(() => {}); }

  // ---- MOBILE WEB ----
  try {
    await page.goto(MOBILE_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SHOTS, 'mobile-home.png'), fullPage: true });
    const body = (await page.textContent('body')) || '';
    ok('Mobile web app renders (non-blank)', body.trim().length > 30, `bodyLen=${body.trim().length}`);
  } catch (e) { ok('Mobile flow', false, String(e).slice(0, 160)); await page.screenshot({ path: path.join(SHOTS, 'mobile-FAIL.png') }).catch(() => {}); }

  await browser.close();
  console.log(lines.join('\n'));
  if (errors.length) console.log(`\n[page errors captured]\n` + errors.slice(0, 8).join('\n'));
  console.log(`\n==== UI SMOKE: ${pass} passed, ${fail} failed ====`);
  console.log(`screenshots in: ${SHOTS}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
