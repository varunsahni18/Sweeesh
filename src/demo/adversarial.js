'use strict';

const { Registry } = require('../core/registry');
const { resolveChain } = require('../core/resolve');
const { evaluateClaim } = require('../core/evaluate');
const { buildBadge, verifyBadge } = require('../core/badge');

/**
 * The adversarial suite. Each vector is an attack that must be rejected.
 *
 * This is the real deliverable of the protocol work: not that the happy path
 * verifies, but that these do not. Every vector states the expected failure
 * code and the run reports whether the core actually produced it.
 */

const YEAR = 365 * 24 * 60 * 60 * 1000;
const iso = (d) => new Date(d).toISOString();

function base() {
  const reg = new Registry();
  const root = reg.addEntity({ id: 'root', name: 'Company Register', kind: 'root' });
  const register = reg.addEntity({ id: 'register', name: 'State Register', kind: 'register' });
  const employer = reg.addEntity({ id: 'employer', name: 'Acme Corp', kind: 'employer' });
  const manager = reg.addEntity({ id: 'manager', name: 'A Manager', kind: 'person', role: 'Engineering Manager' });
  const subject = reg.addEntity({ id: 'subject', name: 'Subject', kind: 'subject' });
  return { reg, root, register, employer, manager, subject };
}

const VECTORS = [
  {
    n: 1,
    name: 'Attester claims a path outside their accreditation',
    expect: 'attester-out-of-scope',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      // The manager signs a degree. Nothing in their scope covers education.
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'education.mit.degree',
        subjectDid: subject.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 2,
    name: 'Intermediate accreditation expired when the attestation was signed',
    expect: 'accreditation-expired',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      const now = Date.now();
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({
        issuerId: register.id,
        subjectId: employer.id,
        scope: { include: ['employment.acme.**'] },
        validFrom: iso(now - 5 * YEAR),
        validUntil: iso(now - 2 * YEAR) // lapsed
      });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [root.id],
        at: iso(now)
      });
    }
  },
  {
    n: 3,
    name: 'Intermediate revoked after signing',
    expect: 'accreditation-revoked',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      const mid = reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      reg.revoke(mid.id, 'employer struck off the register');
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 4,
    name: 'Delegation exceeding maxDelegationDepth',
    expect: 'max-delegation-depth-exceeded',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      // The root permits exactly one hop below it.
      reg.issueAccreditation({
        issuerId: root.id,
        subjectId: register.id,
        scope: { include: ['employment.**'] },
        maxDelegationDepth: 1
      });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 5,
    name: 'Child scope wider than parent scope',
    expect: 'scope-widened',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.work.**'] } });
      // The employer hands the manager more than it holds itself.
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.**'] } });
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 6,
    name: 'Cycle in the accreditation graph',
    expect: 'cycle-in-accreditation-graph',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      reg.issueAccreditation({ issuerId: employer.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.**'] } });
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 7,
    name: 'Manager attesting a subject outside their reporting line',
    expect: 'subject-outside-delegated-line',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      const stranger = reg.addEntity({ id: 'stranger', name: 'Someone Else', kind: 'subject' });
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.**'] } });
      reg.issueAccreditation({
        issuerId: employer.id,
        subjectId: manager.id,
        scope: { include: ['employment.acme.work.**'] },
        subjects: [subject.did] // only their own report
      });
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: stranger.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 8,
    name: 'Excluded path re-granted downstream',
    expect: 'excluded-path-regranted',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({
        issuerId: register.id,
        subjectId: employer.id,
        scope: { include: ['employment.acme.**'], exclude: ['employment.acme.compensation'] }
      });
      // The employer tries to hand back the path it was structurally denied.
      reg.issueAccreditation({
        issuerId: employer.id,
        subjectId: manager.id,
        scope: { include: ['employment.acme.compensation'] }
      });
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.compensation',
        subjectDid: subject.did,
        trustedRoots: [root.id]
      });
    }
  },
  {
    n: 9,
    name: 'Badge replayed to a second audience',
    expect: 'audience-mismatch',
    kind: 'badge',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      reg.issueAttestation({
        attesterId: manager.id,
        subjectDid: subject.did,
        claimPath: 'employment.acme.work.thing',
        claims: { statement: 'did a thing' },
        mode: 'authoritative'
      });
      const badge = buildBadge(reg, {
        subject: { did: subject.did, privateKey: subject.privateKey },
        claimPaths: ['employment.acme.work.thing'],
        trustedRoots: [root.id],
        audience: 'first-employer'
      });
      // Forwarded to somebody the badge was never signed over.
      return verifyBadge(reg, badge, { audience: 'second-employer' });
    }
  },
  {
    n: 10,
    name: 'Corroborators forming a reciprocal-only ring',
    expect: 'downweighted',
    kind: 'corroboration',
    run() {
      const reg = new Registry();
      const a = reg.addEntity({ id: 'a', name: 'A', kind: 'subject' });
      const b = reg.addEntity({ id: 'b', name: 'B', kind: 'subject' });
      // A and B corroborate each other and nobody else.
      reg.issueAttestation({ attesterId: b.id, subjectDid: a.did, claimPath: 'work.x', claims: { rel: 'worked with' }, mode: 'corroborative' });
      reg.issueAttestation({ attesterId: a.id, subjectDid: b.did, claimPath: 'work.x', claims: { rel: 'worked with' }, mode: 'corroborative' });
      return evaluateClaim(reg, { subjectDid: a.did, claimPath: 'work.x', trustedRoots: [] });
    }
  },
  {
    n: 11,
    name: 'Claim valid under root X but not under root Y',
    expect: 'no-accreditation',
    run() {
      const { reg, root, register, employer, manager, subject } = base();
      const otherRoot = reg.addEntity({ id: 'other-root', name: 'A Different Root', kind: 'root' });
      reg.issueAccreditation({ issuerId: root.id, subjectId: register.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: register.id, subjectId: employer.id, scope: { include: ['employment.acme.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      // Same chain, a root the verifier did not nominate.
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [otherRoot.id]
      });
    }
  },
  {
    n: 12,
    name: 'Attestation signed under a key retired before the signing date',
    expect: 'signed-under-a-retired-key',
    run() {
      const reg = new Registry();
      const now = Date.now();
      const root = reg.addEntity({ id: 'root', name: 'Company Register', kind: 'root' });
      const employer = reg.addEntity({ id: 'employer', name: 'Acme Corp', kind: 'employer' });
      const subject = reg.addEntity({ id: 'subject', name: 'Subject', kind: 'subject' });
      const manager = reg.addEntity({
        id: 'manager',
        name: 'A Manager',
        kind: 'person',
        role: 'Engineering Manager',
        keyRetiredAt: iso(now - 2 * YEAR)
      });
      reg.issueAccreditation({ issuerId: root.id, subjectId: employer.id, scope: { include: ['employment.**'] } });
      reg.issueAccreditation({ issuerId: employer.id, subjectId: manager.id, scope: { include: ['employment.acme.work.**'] } });
      // Signed today, under a key retired two years ago.
      return resolveChain(reg, {
        entityId: manager.id,
        claimPath: 'employment.acme.work.thing',
        subjectDid: subject.did,
        trustedRoots: [root.id],
        at: iso(now)
      });
    }
  }
];

function runVector(v) {
  const result = v.run();

  if (v.kind === 'badge') {
    const rejected = !result.valid && result.reasons.includes(v.expect);
    return { n: v.n, name: v.name, expected: v.expect, actual: result.reasons.join(', ') || 'accepted', rejected };
  }

  if (v.kind === 'corroboration') {
    const ring = (result.corroborators || []).every((c) => c.reciprocalOnly);
    const downweighted = (result.corroborators || []).every((c) => c.weight < 0.5);
    return {
      n: v.n,
      name: v.name,
      expected: v.expect,
      actual: ring && downweighted ? `downweighted to ${result.corroborators.map((c) => c.weight).join(', ')}` : 'full weight',
      rejected: ring && downweighted
    };
  }

  const rejected = !result.complete && result.failure && result.failure.code === v.expect;
  return {
    n: v.n,
    name: v.name,
    expected: v.expect,
    actual: result.complete ? 'chain resolved — ATTACK SUCCEEDED' : result.failure?.code || 'unknown',
    rejected
  };
}

function runAdversarialSuite() {
  const vectors = VECTORS.map(runVector);
  return {
    total: vectors.length,
    rejected: vectors.filter((v) => v.rejected).length,
    green: vectors.every((v) => v.rejected),
    vectors
  };
}

module.exports = { runAdversarialSuite, VECTORS };
