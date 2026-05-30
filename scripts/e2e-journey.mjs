// End-to-end cross-role journey against the live gateway (http://localhost:3021).
// Patient (mobile) -> Caregiver (portal) -> Admin (portal). Uses Bearer tokens.
const BASE = 'http://localhost:3021';
const ts = Date.now();
const patientEmail = `e2e-patient-${ts}@karuna.test`;
const caregiverEmail = `e2e-caregiver-${ts}@karuna.test`;
const PW = 'TestPass123!';
const ADMIN_EMAIL = 'admin@karuna.com';
const ADMIN_PW = 'KarunaAdmin#2026';

let pass = 0, fail = 0;
const lines = [];
function check(name, cond, detail = '') {
  if (cond) { pass++; lines.push(`  PASS  ${name}`); }
  else { fail++; lines.push(`  FAIL  ${name}   ${detail}`); }
}
async function api(method, path, { token, body, admin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (admin) headers['X-Requested-With'] = 'XMLHttpRequest';
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const listOf = (d) => Array.isArray(d) ? d : (d?.data || d?.medications || d?.users || d?.circles || []);

(async () => {
  // ---------- PATIENT (mobile) ----------
  let r = await api('POST', '/api/care/auth/register', { body: { email: patientEmail, password: PW, name: 'E2E Patient' } });
  check('Patient register', r.status === 200 && !!r.data?.token, `status=${r.status} ${JSON.stringify(r.data)}`);

  r = await api('POST', '/api/care/auth/login', { body: { email: patientEmail, password: PW } });
  check('Patient login', r.status === 200 && !!r.data?.token, `status=${r.status}`);
  const tokenP = r.data?.token;

  r = await api('GET', '/api/care/auth/me', { token: tokenP });
  check('Patient /auth/me', r.status === 200 && r.data?.user?.email === patientEmail, `status=${r.status}`);

  r = await api('POST', '/api/care/circles', { token: tokenP, body: { name: 'E2E Family Circle', elderlyName: 'Grandpa Joe' } });
  const circleId = r.data?.circle?.id;
  check('Patient create circle', r.status === 200 && !!circleId, `status=${r.status} ${JSON.stringify(r.data)}`);

  r = await api('POST', `/api/care/circles/${circleId}/vault/medications`, { token: tokenP, body: { name: 'Aspirin', dosage: '100mg', frequency: 'daily', timing: ['08:00'], instructions: 'After breakfast' } });
  const medId = r.data?.medication?.id;
  check('Patient add medication', r.status === 200 && !!medId, `status=${r.status} ${JSON.stringify(r.data)}`);

  r = await api('GET', `/api/care/circles/${circleId}/vault/medications`, { token: tokenP });
  check('Patient lists own medication', r.status === 200 && listOf(r.data).some(m => m.id === medId), `status=${r.status} ${JSON.stringify(r.data)}`);

  // ---------- INVITE / JOIN ----------
  r = await api('POST', `/api/care/circles/${circleId}/invite`, { token: tokenP, body: { email: caregiverEmail, role: 'caregiver' } });
  const inviteToken = r.data?.invitation?.inviteLink?.split('/').pop();
  check('Patient invites caregiver', r.status === 200 && !!inviteToken, `status=${r.status} ${JSON.stringify(r.data)}`);

  r = await api('POST', `/api/care/invitations/${inviteToken}/accept`, { body: { password: PW } });
  check('Caregiver accepts invitation', r.status === 200 && !!r.data?.token, `status=${r.status} ${JSON.stringify(r.data)}`);

  // ---------- CAREGIVER (portal) ----------
  r = await api('POST', '/api/care/auth/login', { body: { email: caregiverEmail, password: PW } });
  check('Caregiver login', r.status === 200 && !!r.data?.token, `status=${r.status}`);
  const tokenC = r.data?.token;

  r = await api('GET', '/api/care/circles', { token: tokenC });
  check('Caregiver sees the circle', r.status === 200 && listOf(r.data).some(c => c.id === circleId), `status=${r.status}`);

  r = await api('GET', `/api/care/circles/${circleId}`, { token: tokenC });
  check('Circle detail shows 2 members', r.status === 200 && (r.data?.members?.length >= 2), `status=${r.status} members=${r.data?.members?.length}`);

  // Consent state 1: not yet synced -> default allow
  r = await api('GET', `/api/care/circles/${circleId}/vault/medications`, { token: tokenC });
  check('Caregiver views meds (no consent synced -> allow)', r.status === 200, `status=${r.status} ${JSON.stringify(r.data)}`);

  // Consent state 2: restrictive sync -> block
  r = await api('PUT', `/api/care/circles/${circleId}/consent`, { token: tokenP, body: { consent: { globalDataSharing: false, consents: [] } } });
  check('Patient syncs restrictive consent', r.status === 200, `status=${r.status}`);
  r = await api('GET', `/api/care/circles/${circleId}/vault/medications`, { token: tokenC });
  check('Consent gate BLOCKS caregiver (403)', r.status === 403, `status=${r.status} ${JSON.stringify(r.data)}`);

  // Consent state 3: explicit grant -> allow
  r = await api('PUT', `/api/care/circles/${circleId}/consent`, { token: tokenP, body: { consent: { globalDataSharing: false, consents: [{ category: 'health_data', grantee: 'caregiver_member', accessLevel: 'read' }] } } });
  check('Patient grants health_data consent', r.status === 200, `status=${r.status}`);
  r = await api('GET', `/api/care/circles/${circleId}/vault/medications`, { token: tokenC });
  check('Caregiver views meds after grant (200 + med present)', r.status === 200 && listOf(r.data).some(m => m.id === medId), `status=${r.status}`);

  r = await api('GET', `/api/care/circles/${circleId}/sync`, { token: tokenC });
  check('Caregiver pulls sync data', r.status === 200, `status=${r.status}`);

  // RBAC: caregiver may not delete the circle
  r = await api('DELETE', `/api/care/circles/${circleId}`, { token: tokenC });
  check('RBAC: caregiver cannot delete circle (403)', r.status === 403, `status=${r.status} ${JSON.stringify(r.data)}`);

  // ---------- ADMIN (portal) ----------
  r = await api('POST', '/api/admin/auth/login', { admin: true, body: { email: ADMIN_EMAIL, password: ADMIN_PW } });
  check('Admin login', r.status === 200 && !!r.data?.token, `status=${r.status}`);
  const tokenA = r.data?.token;

  r = await api('GET', '/api/admin/users?limit=500', { token: tokenA, admin: true });
  const users = listOf(r.data);
  check('Admin sees patient account', users.some(u => u.email === patientEmail), `users=${users.length}`);
  check('Admin sees caregiver account', users.some(u => u.email === caregiverEmail), `users=${users.length}`);

  r = await api('GET', '/api/admin/circles?limit=500', { token: tokenA, admin: true });
  check('Admin sees the circle', listOf(r.data).some(c => c.id === circleId), `circles=${listOf(r.data).length}`);

  r = await api('GET', '/api/admin/metrics/dashboard', { token: tokenA, admin: true });
  check('Admin dashboard metrics', r.status === 200, `status=${r.status}`);

  r = await api('GET', '/api/admin/audit-logs?limit=10', { token: tokenA, admin: true });
  check('Admin audit logs', r.status === 200, `status=${r.status}`);

  console.log(lines.join('\n'));
  console.log(`\n==== E2E RESULT: ${pass} passed, ${fail} failed ====`);
  console.log(`circleId=${circleId}  patient=${patientEmail}  caregiver=${caregiverEmail}`);
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(2); });
