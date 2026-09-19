'use strict';

/**
 * Chain resolution.
 *
 * The rule: every attester must themselves be attested, recursively, until a
 * root the verifier chose. A break anywhere invalidates — for that claim.
 *
 * At every hop we check:
 *   - the accreditation signature is valid
 *   - the accreditation was inside its validity window at signing time
 *   - neither the accreditation nor its issuer is revoked
 *   - the child's scope is contained in the parent's (monotonic attenuation)
 *   - delegation depth has not exceeded the parent's maxDelegationDepth
 *
 * Completeness is evaluated per claim, never per badge.
 */

const FAILURES = {
  NO_ACCREDITATION: 'no-accreditation',
  OUT_OF_SCOPE: 'attester-out-of-scope',
  EXPIRED: 'accreditation-expired',
  NOT_YET_VALID: 'accreditation-not-yet-valid',
  REVOKED: 'accreditation-revoked',
  BAD_SIGNATURE: 'accreditation-signature-invalid',
  SCOPE_WIDENED: 'scope-widened',
  DEPTH_EXCEEDED: 'max-delegation-depth-exceeded',
  CYCLE: 'cycle-in-accreditation-graph',
  SUBJECT_OUT_OF_LINE: 'subject-outside-delegated-line',
  KEY_RETIRED: 'signed-under-a-retired-key',
  ROOT_NOT_TRUSTED: 'no-path-to-a-trusted-root'
};

function withinWindow(acc, at) {
  const t = new Date(at).getTime();
  if (acc.validFrom && t < new Date(acc.validFrom).getTime()) return FAILURES.NOT_YET_VALID;
  if (acc.validUntil && t > new Date(acc.validUntil).getTime()) return FAILURES.EXPIRED;
  return null;
}

/**
 * Walk upward from `entityId` for `claimPath`, stopping at any entity id in
 * `trustedRoots`.
 *
 * @returns {{complete: boolean, root: string|null, hops: Array, failure: object|null, depth: number}}
 */
function resolveChain(registry, { entityId, claimPath, trustedRoots, subjectDid = null, at = new Date().toISOString() }) {
  const roots = new Set(trustedRoots || []);
  const hops = [];
  const visited = new Set();

  let current = entityId;
  let childScope = null;
  let depth = 0;

  if (roots.has(current)) {
    return { complete: true, root: current, hops, failure: null, depth: 0 };
  }

  // The signing key must have been live when the attestation was signed.
  const signer = registry.entity(entityId);
  if (signer && signer.keyRetiredAt && new Date(at).getTime() > new Date(signer.keyRetiredAt).getTime()) {
    return {
      complete: false,
      root: null,
      hops,
      depth: 0,
      failure: { code: FAILURES.KEY_RETIRED, at: entityId, retiredAt: signer.keyRetiredAt }
    };
  }

  for (;;) {
    if (visited.has(current)) {
      return { complete: false, root: null, hops, depth, failure: { code: FAILURES.CYCLE, at: current } };
    }
    visited.add(current);

    const candidates = registry.accreditationsFor(current);
    if (candidates.length === 0) {
      return {
        complete: false,
        root: null,
        hops,
        depth,
        failure: { code: FAILURES.NO_ACCREDITATION, at: current, entity: nameOf(registry, current) }
      };
    }

    // Try every accreditation held by this entity; the chain only needs one
    // sound path to a trusted root.
    let chosen = null;
    let lastFailure = null;

    for (const acc of candidates) {
      const check = checkHop(registry, acc, { claimPath, childScope, at, depth, subjectDid });
      if (check.ok) {
        chosen = acc;
        break;
      }
      lastFailure = check.failure;
    }

    if (!chosen) {
      return { complete: false, root: null, hops, depth, failure: lastFailure };
    }

    hops.push({
      accreditationId: chosen.id,
      from: chosen.subjectId,
      fromName: nameOf(registry, chosen.subjectId),
      to: chosen.issuerId,
      toName: nameOf(registry, chosen.issuerId),
      toKind: registry.entity(chosen.issuerId)?.kind || null,
      scope: chosen.scope,
      validUntil: chosen.validUntil
    });

    childScope = chosen.scope;
    current = chosen.issuerId;
    depth += 1;

    if (roots.has(current)) {
      return { complete: true, root: current, hops, failure: null, depth };
    }

    if (depth > 16) {
      return { complete: false, root: null, hops, depth, failure: { code: FAILURES.DEPTH_EXCEEDED, at: current } };
    }
  }
}

function checkHop(registry, acc, { claimPath, childScope, at, depth, subjectDid }) {
  if (registry.isRevoked(acc.id)) {
    return { ok: false, failure: { code: FAILURES.REVOKED, accreditationId: acc.id, at: acc.subjectId } };
  }

  // A manager delegated to attest their own reports cannot attest a stranger.
  if (acc.subjects && subjectDid && !acc.subjects.includes(subjectDid)) {
    return { ok: false, failure: { code: FAILURES.SUBJECT_OUT_OF_LINE, accreditationId: acc.id } };
  }

  if (!registry.verifyAccreditation(acc)) {
    return { ok: false, failure: { code: FAILURES.BAD_SIGNATURE, accreditationId: acc.id } };
  }

  const windowFailure = withinWindow(acc, at);
  if (windowFailure) {
    return {
      ok: false,
      failure: { code: windowFailure, accreditationId: acc.id, validUntil: acc.validUntil, at: acc.subjectId }
    };
  }

  // Monotonic attenuation: the scope below must be contained in this one.
  // Checked before the path check, because when a child re-grants a path its
  // parent was denied, "excluded-path-regranted" is the precise diagnosis and
  // "out-of-scope" is only the symptom.
  if (childScope) {
    const containment = registry.scopeContains(acc.scope, childScope);
    if (!containment.ok) {
      return {
        ok: false,
        failure: { code: containment.code || FAILURES.SCOPE_WIDENED, accreditationId: acc.id, detail: containment.detail }
      };
    }
  }

  // The accreditation must actually cover the path being claimed.
  if (!registry.scopeAllows(acc.scope, claimPath)) {
    return { ok: false, failure: { code: FAILURES.OUT_OF_SCOPE, accreditationId: acc.id, claimPath } };
  }

  if (depth + 1 > acc.maxDelegationDepth) {
    return {
      ok: false,
      failure: { code: FAILURES.DEPTH_EXCEEDED, accreditationId: acc.id, maxDelegationDepth: acc.maxDelegationDepth }
    };
  }

  return { ok: true };
}

function nameOf(registry, id) {
  return registry.entity(id)?.name || id;
}

module.exports = { resolveChain, FAILURES };
