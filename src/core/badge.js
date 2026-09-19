'use strict';

const { sign, verify, contentHash, randomId, nonce: makeNonce } = require('./crypto');
const { evaluateClaim, scoreConfidence } = require('./evaluate');

/**
 * The badge is one object a person sends to anyone. A link, a QR code or a file.
 * The recipient needs no Sweesh account.
 *
 * It carries the claims the subject chose to reveal, a proof per claim, the
 * roots those proofs were made against, and an audience + nonce so it cannot be
 * replayed elsewhere. It never carries the full resume, the withheld fields, or
 * anything the subject did not deliberately send.
 */

function buildBadge(registry, {
  subject,               // { did, privateKey }
  claimPaths,            // paths the subject chooses to reveal
  disclose = {},         // { [claimPath]: [field] } — field-level selective disclosure
  trustedRoots,
  audience,
  nonce = makeNonce(),
  expiresAt = null,
  allPaths = []          // the subject's full path list, so we can report withheld
}) {
  const at = new Date().toISOString();
  const selected = new Set(claimPaths);

  const claims = claimPaths.map((claimPath) => {
    const evaluated = evaluateClaim(registry, { subjectDid: subject.did, claimPath, trustedRoots, at });
    evaluated.confidence = scoreConfidence(evaluated);

    const fields = disclose[claimPath];
    const source = evaluated.claims || {};
    const disclosed = {};
    const withheldFields = [];

    for (const key of Object.keys(source)) {
      if (!fields || fields.includes(key)) disclosed[key] = source[key];
      else withheldFields.push(key);
    }

    return {
      claimPath,
      state: evaluated.state,
      mode: evaluated.mode,
      root: evaluated.root,
      rootId: evaluated.rootId,
      unrevoked: evaluated.unrevoked,
      confidence: evaluated.confidence,
      // depth is disclosed, the hops are not — the verifier learns the claim is
      // backed, not which institution or which manager backed it
      chainDepth: evaluated.depth,
      chainDigest: evaluated.chain.length ? contentHash(evaluated.chain.map((h) => h.accreditationId)) : null,
      corroboratorCount: (evaluated.corroborators || []).length,
      disclosed,
      withheldFields,
      basis: evaluated.basis || null,
      authorityFailure: evaluated.authorityFailure || null
    };
  });

  const withheldPaths = allPaths.filter((p) => !selected.has(p));

  const body = {
    type: 'SweeshBadge',
    subject: subject.did,
    audience,
    nonce,
    issuedAt: at,
    expiresAt,
    trustedRoots,
    claims,
    // Shown as withheld rather than omitted: it tells the employer the candidate
    // is exercising control rather than concealing an absence.
    withheld: withheldPaths
  };

  return {
    badgeId: randomId('badge'),
    ...body,
    // Holder binding: the presenter proves control of the subject key over the
    // audience and nonce, so forwarding this to a second employer fails.
    holderProof: {
      type: 'Ed25519Signature2020',
      created: at,
      verificationMethod: `${subject.did}#keys-1`,
      proofPurpose: 'authentication',
      signatureValue: sign(body, subject.privateKey)
    }
  };
}

/**
 * Verify a badge. Offline-checkable given a cached registry root — no callback
 * to Sweesh, the university or the employer at verification time.
 */
function verifyBadge(registry, badge, { audience, subjectPublicKey, at = new Date().toISOString() } = {}) {
  const reasons = [];

  if (!badge || !badge.holderProof) {
    return { valid: false, reasons: ['missing-badge'], claims: [] };
  }

  const body = {
    type: 'SweeshBadge',
    subject: badge.subject,
    audience: badge.audience,
    nonce: badge.nonce,
    issuedAt: badge.issuedAt,
    expiresAt: badge.expiresAt,
    trustedRoots: badge.trustedRoots,
    claims: badge.claims,
    withheld: badge.withheld
  };

  const key =
    subjectPublicKey ||
    [...registry.entities.values()].find((e) => e.did === badge.subject)?.publicKey;

  if (!key) reasons.push('subject-key-unknown');
  else if (!verify(body, badge.holderProof.signatureValue, key)) reasons.push('holder-binding-failed');

  if (audience && badge.audience !== audience) reasons.push('audience-mismatch');
  if (badge.expiresAt && new Date(at).getTime() > new Date(badge.expiresAt).getTime()) reasons.push('badge-expired');
  if (registry.isRevoked(badge.badgeId)) reasons.push('badge-revoked-by-subject');

  // Re-resolve every claim live, so a revocation since issuance shows up now.
  const claims = badge.claims.map((c) => {
    const fresh = evaluateClaim(registry, {
      subjectDid: badge.subject,
      claimPath: c.claimPath,
      trustedRoots: badge.trustedRoots,
      at
    });
    fresh.confidence = scoreConfidence(fresh);
    return {
      claimPath: c.claimPath,
      state: fresh.state,
      root: fresh.root,
      unrevoked: fresh.unrevoked,
      mode: fresh.mode,
      confidence: fresh.confidence,
      changedSinceIssue: fresh.state !== c.state,
      disclosed: c.disclosed,
      withheldFields: c.withheldFields,
      authorityFailure: fresh.authorityFailure || null
    };
  });

  return {
    valid: reasons.length === 0,
    reasons,
    audience: badge.audience,
    checkedAt: at,
    // Per-claim completeness. A 2009 employer that no longer exists does not
    // invalidate a 2024 degree.
    summary: {
      authoritative: claims.filter((c) => c.state === 'authoritative').length,
      corroborative: claims.filter((c) => c.state === 'corroborative').length,
      selfAsserted: claims.filter((c) => c.state === 'self-asserted').length,
      unverified: claims.filter((c) => c.state === 'unverified').length,
      withheld: (badge.withheld || []).length
    },
    claims
  };
}

module.exports = { buildBadge, verifyBadge };
