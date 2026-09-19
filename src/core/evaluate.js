'use strict';

const { resolveChain } = require('./resolve');

/**
 * Per-claim evaluation into the four badge states.
 *
 * Four states, not two, is deliberate. Collapsing this to verified/unverified
 * would destroy the information the model exists to carry.
 *
 *   authoritative  complete chain to the verifier's root
 *   corroborative  no authority chain; N independent verified peers agree
 *   self-asserted  the subject's own statement, bound to them, backed by nobody
 *   withheld       exists but deliberately not disclosed
 */

function evaluateClaim(registry, { subjectDid, claimPath, trustedRoots, at = new Date().toISOString() }) {
  const all = registry.attestationsForPath(subjectDid, claimPath);

  const live = all.filter((a) => {
    if (registry.isRevoked(a.id)) return false;
    if (!registry.verifyAttestation(a)) return false;
    if (a.validUntil && new Date(at).getTime() > new Date(a.validUntil).getTime()) return false;
    return true;
  });

  const authoritativeAttempts = [];

  // --- authoritative: does any attester resolve to a trusted root? ---------
  for (const att of live.filter((a) => a.mode === 'authoritative')) {
    const chain = resolveChain(registry, {
      entityId: att.attesterId,
      claimPath,
      trustedRoots,
      subjectDid,
      at: att.issuedAt // the chain must have been sound when it was signed
    });
    authoritativeAttempts.push({ attestation: att, chain });
    if (chain.complete) {
      const signer = registry.entity(att.attesterId);
      return {
        claimPath,
        state: 'authoritative',
        mode: 'authoritative',
        root: registry.entity(chain.root)?.name || chain.root,
        rootId: chain.root,
        unrevoked: true,
        chain: chain.hops,
        depth: chain.depth,
        signer: signer ? { id: signer.id, name: signer.name, role: signer.role } : null,
        coSigners: live
          .filter((a) => a.mode === 'authoritative' && a.id !== att.id)
          .map((a) => describeSigner(registry, a)),
        corroborators: describeCorroborators(registry, live, subjectDid),
        claims: att.claims,
        basis: att.basis,
        attestationId: att.id,
        confidence: null // filled in below
      };
    }
  }

  // --- corroborative: peers with standing, but no authority ---------------
  const corroborators = describeCorroborators(registry, live, subjectDid);
  if (corroborators.length > 0) {
    const merged = {};
    live.filter((a) => a.mode === 'corroborative').forEach((a) => Object.assign(merged, a.claims || {}));
    return {
      claimPath,
      state: 'corroborative',
      mode: 'corroborative',
      root: null,
      rootId: null,
      unrevoked: true,
      chain: [],
      depth: 0,
      signer: null,
      coSigners: [],
      corroborators,
      claims: merged,
      basis: null,
      attestationId: null,
      // why the authoritative route did not succeed — this is the honest part
      authorityFailure: authoritativeAttempts.find((a) => !a.chain.complete)?.chain.failure || null,
      confidence: null
    };
  }

  // --- self-asserted ------------------------------------------------------
  const selfAtt = live.find((a) => a.mode === 'self-asserted');
  if (selfAtt) {
    return {
      claimPath,
      state: 'self-asserted',
      mode: 'self-asserted',
      root: null,
      rootId: null,
      unrevoked: true,
      chain: [],
      depth: 0,
      signer: null,
      coSigners: [],
      corroborators: [],
      claims: selfAtt.claims,
      basis: null,
      attestationId: selfAtt.id,
      authorityFailure: authoritativeAttempts.find((a) => !a.chain.complete)?.chain.failure || null,
      confidence: null
    };
  }

  // Nothing survived. Say why rather than showing a bare red cross.
  return {
    claimPath,
    state: 'unverified',
    mode: null,
    root: null,
    rootId: null,
    unrevoked: false,
    chain: [],
    depth: 0,
    signer: null,
    coSigners: [],
    corroborators: [],
    claims: {},
    authorityFailure: authoritativeAttempts.find((a) => !a.chain.complete)?.chain.failure || {
      code: 'no-attestation',
      detail: 'nothing has been attested at this path'
    },
    confidence: 0
  };
}

function describeSigner(registry, att) {
  const e = registry.entity(att.attesterId);
  return e ? { id: e.id, name: e.name, role: e.role } : null;
}

/**
 * Corroboration strength comes from the corroborator's own verified standing,
 * from whether HR independently confirms the two people overlapped, and from
 * graph independence. Reciprocal-only clusters are detected and downweighted.
 */
function describeCorroborators(registry, live, subjectDid) {
  return live
    .filter((a) => a.mode === 'corroborative')
    .map((a) => {
      const e = registry.entity(a.attesterId);
      if (!e) return null;
      const overlapConfirmed = registry.overlapConfirmed(e.did, subjectDid);
      const reciprocalOnly = isReciprocalOnly(registry, e.did, subjectDid);
      return {
        id: e.id,
        name: e.name,
        role: e.role,
        rel: (a.claims && a.claims.rel) || 'corroborated',
        overlapConfirmed,
        reciprocalOnly,
        weight: Number((1 * (overlapConfirmed ? 1 : 0.4) * (reciprocalOnly ? 0.3 : 1)).toFixed(2))
      };
    })
    .filter(Boolean);
}

/**
 * Two people who corroborate each other and nobody else form a reciprocal-only
 * ring. Legitimate corroborators vouch across a wider graph.
 */
function isReciprocalOnly(registry, corroboratorDid, subjectDid) {
  const outgoing = [...registry.attestations.values()].filter(
    (a) => a.mode === 'corroborative' && a.attester === corroboratorDid
  );
  if (outgoing.length !== 1) return false;
  const back = [...registry.attestations.values()].filter(
    (a) => a.mode === 'corroborative' && a.attester === subjectDid && a.subject === corroboratorDid
  );
  return back.length > 0 && outgoing[0].subject === subjectDid;
}

/**
 * Confidence is a deterministic, documented function — not a vibe.
 *   authoritative : 100 minus a small penalty per extra hop, minus 6 if the
 *                   outcome carries an attester-estimate basis
 *   corroborative : saturating curve over summed corroborator weight
 *   self-asserted : fixed floor; the subject is bound to it but nobody backs it
 */
function scoreConfidence(claim) {
  if (claim.state === 'authoritative') {
    const hopPenalty = Math.max(0, claim.depth - 3) * 2;
    const basisPenalty = claim.basis === 'attester-estimate' ? 6 : 0;
    const coSignBonus = Math.min(2, (claim.coSigners || []).length);
    return Math.max(70, Math.min(99, 98 - hopPenalty - basisPenalty + coSignBonus));
  }
  if (claim.state === 'corroborative') {
    const weight = (claim.corroborators || []).reduce((s, c) => s + c.weight, 0);
    return Math.round(30 + 50 * (1 - Math.exp(-weight / 2.2)));
  }
  if (claim.state === 'self-asserted') return 15;
  return 0;
}

module.exports = { evaluateClaim, scoreConfidence };
