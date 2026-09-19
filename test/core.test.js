const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');

const serverPath = path.join(__dirname, '..', 'server.js');

function waitForServer(url, timeoutMs = 10000) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const ping = () => {
      fetch(url)
        .then((res) => res.json())
        .then((body) => resolve(body))
        .catch(() => {
          if (Date.now() - started > timeoutMs) {
            reject(new Error(`Server did not start on ${url}`));
            return;
          }
          setTimeout(ping, 200);
        });
    };

    ping();
  });
}

function startServer(port) {
  return spawn(process.execPath, [serverPath], {
    cwd: path.dirname(serverPath),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

test('resolved resume matches the seeded scenario: auth/corro/self derived, not hardcoded', async () => {
  const child = startServer(4030);

  try {
    await waitForServer('http://localhost:4030/health');

    const res = await fetch('http://localhost:4030/api/resume');
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(body.subject.name, 'Varun Sahni');
    assert.equal(body.claims.length, 12);

    const byId = Object.fromEntries(body.claims.map((c) => [c.id, c]));

    // authoritative: full chain to a root, with the signer and institution named
    assert.equal(byId.nyu.state, 'auth');
    assert.equal(byId.nyu.root, 'US Dept of Education');
    assert.ok(byId.nyu.conf >= 90);

    assert.equal(byId.qual.state, 'auth');
    assert.equal(byId.qual.signers.length, 2); // Ananya + Marcus co-signed

    // corroborative: peers only, no authority chain
    assert.equal(byId.ach.state, 'corro');
    assert.equal(byId.ach.peers.length, 4);
    assert.equal(byId.ach.root, null);

    // self-asserted: bound to the subject, backed by nobody
    assert.equal(byId.cabinai.state, 'self');
    assert.equal(byId.cabinai.conf, 15);
  } finally {
    child.kill('SIGTERM');
  }
});

test('revoking the manager\'s accreditation degrades the claim, per claim not per badge', async () => {
  const child = startServer(4031);

  try {
    await waitForServer('http://localhost:4031/health');

    const before = await (await fetch('http://localhost:4031/api/claims/employment.qualcomm.work.codebuddy')).json();
    assert.equal(before.state, 'authoritative');

    const accs = await (await fetch('http://localhost:4031/api/registry/accreditations')).json();
    const ananyaAcc = accs.accreditations.find((a) => a.subject === 'Ananya Rao');
    assert.ok(ananyaAcc);

    await fetch('http://localhost:4031/api/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: ananyaAcc.id, reason: 'test revocation' })
    });

    const after = await (await fetch('http://localhost:4031/api/claims/employment.qualcomm.work.codebuddy')).json();
    // Marcus's independent co-signature under the same employer still resolves.
    assert.equal(after.state, 'authoritative');

    // A claim with only one authoritative signer degrades when that signer is cut.
    const beforeDegree = await (await fetch('http://localhost:4031/api/claims/education.nyu.degree')).json();
    assert.equal(beforeDegree.state, 'authoritative');

    const nyuAccs = accs.accreditations.filter((a) => a.subject === 'NYU Registrar' || a.issuer === 'NYU Registrar');
    const nyuRegistrarAcc = accs.accreditations.find((a) => a.subject === 'NYU Registrar');
    await fetch('http://localhost:4031/api/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: nyuRegistrarAcc.id, reason: 'test revocation' })
    });

    const afterDegree = await (await fetch('http://localhost:4031/api/claims/education.nyu.degree')).json();
    assert.notEqual(afterDegree.state, 'authoritative');

    // The unrelated BITS degree is untouched — completeness is per claim.
    const bits = await (await fetch('http://localhost:4031/api/claims/education.bits.degree')).json();
    assert.equal(bits.state, 'authoritative');
  } finally {
    child.kill('SIGTERM');
  }
});

test('badge is audience-bound and holder-bound: replay to a second audience fails', async () => {
  const child = startServer(4032);

  try {
    await waitForServer('http://localhost:4032/health');

    const badge = await (
      await fetch('http://localhost:4032/api/badges/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimPaths: ['education.nyu.degree'],
          disclose: { 'education.nyu.degree': ['institution', 'award'] },
          audience: 'acme-hiring'
        })
      })
    ).json();

    assert.ok(badge.holderProof.signatureValue);
    assert.equal(badge.claims[0].disclosed.institution, 'New York University');
    assert.equal(badge.claims[0].disclosed.conferred, undefined); // withheld field

    const okVerify = await (
      await fetch('http://localhost:4032/api/badges/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId: badge.badgeId, audience: 'acme-hiring' })
      })
    ).json();
    assert.equal(okVerify.valid, true);
    assert.equal(okVerify.summary.authoritative, 1);

    const replay = await (
      await fetch('http://localhost:4032/api/badges/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ badgeId: badge.badgeId, audience: 'a-different-employer' })
      })
    ).json();
    assert.equal(replay.valid, false);
    assert.ok(replay.reasons.includes('audience-mismatch'));
  } finally {
    child.kill('SIGTERM');
  }
});

test('adversarial suite: all 12 vectors are rejected', async () => {
  const child = startServer(4033);

  try {
    await waitForServer('http://localhost:4033/health');
    const suite = await (await fetch('http://localhost:4033/api/adversarial')).json();
    assert.equal(suite.total, 12);
    assert.equal(suite.rejected, 12);
    assert.equal(suite.green, true);
  } finally {
    child.kill('SIGTERM');
  }
});
