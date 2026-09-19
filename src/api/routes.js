'use strict';

const express = require('express');
const QRCode = require('qrcode');
const { seed } = require('../demo/seed');
const { evaluateClaim, scoreConfidence } = require('../core/evaluate');
const { resolveChain } = require('../core/resolve');
const { buildBadge, verifyBadge } = require('../core/badge');
const { randomId } = require('../core/crypto');
const { runAdversarialSuite } = require('../demo/adversarial');

function createApi() {
  const router = express.Router();
  let state = seed();
  const badges = new Map();
  const roomSessions = new Map();

  const allRootIds = () => state.registry.roots().map((r) => r.id);

  function rootsFromQuery(q) {
    if (!q) return allRootIds();
    const requested = String(q).split(',').map((s) => s.trim()).filter(Boolean);
    return requested.length ? requested : allRootIds();
  }

  /** Flatten a resolved chain into the institution / register / root the UI draws. */
  function chainShape(chain) {
    const pick = (kinds) => chain.find((h) => kinds.includes(h.toKind));
    return {
      inst: pick(['institution', 'employer'])?.toName || null,
      reg: pick(['register'])?.toName || null,
      root: pick(['root'])?.toName || null
    };
  }

  function evaluateResume(trustedRoots) {
    return state.resume.map((row) => {
      const claim = evaluateClaim(state.registry, {
        subjectDid: state.subject.did,
        claimPath: row.claimPath,
        trustedRoots
      });
      claim.confidence = scoreConfidence(claim);

      const signers = [claim.signer, ...(claim.coSigners || [])].filter(Boolean).map((s) => ({
        name: s.name,
        role: s.role,
        rel: s.id === claim.signer?.id ? 'signed under delegation' : 'co-signed'
      }));

      const peers = (claim.corroborators || []).map((c) => ({
        name: c.name,
        role: c.role,
        rel: c.rel,
        overlapConfirmed: c.overlapConfirmed,
        weight: c.weight
      }));

      const shape = chainShape(claim.chain);

      return {
        id: row.id,
        claimPath: row.claimPath,
        label: row.label,
        y0: row.y0,
        y1: row.y1,
        // 'auth' | 'corro' | 'self' | 'unverified' — the words the UI uses
        state:
          claim.state === 'authoritative' ? 'auth'
            : claim.state === 'corroborative' ? 'corro'
              : claim.state === 'self-asserted' ? 'self'
                : 'unverified',
        fullState: claim.state,
        conf: claim.confidence,
        signers,
        peers,
        inst: shape.inst,
        reg: shape.reg,
        root: shape.root,
        chain: claim.chain.map((h) => ({ from: h.fromName, to: h.toName, kind: h.toKind })),
        claims: claim.claims,
        basis: claim.basis || null,
        authorityFailure: claim.authorityFailure || null
      };
    });
  }

  // ------------------------------------------------------------------ meta

  router.get('/demo/overview', (req, res) => {
    res.json({
      name: 'Sweesh Core',
      model: 'attestations + delegated authority + per-claim chain resolution',
      subject: { name: state.subject.name, did: state.subject.did },
      counts: {
        entities: state.registry.entities.size,
        accreditations: state.registry.accreditations.size,
        attestations: state.registry.attestations.size,
        revoked: state.registry.revoked.size
      },
      capabilities: [
        'issue attestations targeting claim paths',
        'issue accreditations with scope, validity window and max delegation depth',
        'enforce monotonic scope attenuation',
        'resolve an authority chain to a verifier-nominated root',
        'evaluate completeness per claim, never per badge',
        'selective disclosure at field level',
        'audience-bound, time-bound badges with holder binding',
        'revocation by issuer, independently of badge invalidation',
        'corroboration scoring with reciprocal-cluster detection'
      ],
      notImplemented: [
        'zero-knowledge chain proofs (tier 2)',
        'predicate proofs over dates and durations (tier 1)',
        'Merkle registry + append-only transparency log',
        'SD-JWT VC / W3C VC 2.0 wire format',
        'persistent storage — this registry is in memory'
      ]
    });
  });

  // -------------------------------------------------------------- registry

  router.get('/registry/roots', (req, res) => {
    res.json({
      roots: state.registry.roots().map((r) => ({ id: r.id, name: r.name, did: r.did }))
    });
  });

  router.get('/registry/entities', (req, res) => {
    res.json({
      entities: [...state.registry.entities.values()].map((e) => ({
        id: e.id,
        name: e.name,
        kind: e.kind,
        role: e.role,
        did: e.did,
        keyRetiredAt: e.keyRetiredAt
      }))
    });
  });

  router.get('/registry/accreditations', (req, res) => {
    res.json({
      accreditations: [...state.registry.accreditations.values()].map((a) => ({
        id: a.id,
        issuer: state.registry.entity(a.issuerId)?.name,
        issuerId: a.issuerId,
        subject: state.registry.entity(a.subjectId)?.name,
        subjectId: a.subjectId,
        scope: a.scope,
        validFrom: a.validFrom,
        validUntil: a.validUntil,
        maxDelegationDepth: a.maxDelegationDepth,
        revoked: state.registry.isRevoked(a.id)
      }))
    });
  });

  router.get('/registry/attestations', (req, res) => {
    res.json({
      attestations: [...state.registry.attestations.values()].map((a) => ({
        id: a.id,
        attester: state.registry.entity(a.attesterId)?.name,
        attesterId: a.attesterId,
        claimPath: a.claimPath,
        mode: a.mode,
        issuedAt: a.issuedAt,
        basis: a.basis,
        revoked: state.registry.isRevoked(a.id),
        signatureValid: state.registry.verifyAttestation(a)
      }))
    });
  });

  // ---------------------------------------------------------------- resume

  /**
   * The whole resume, resolved against the roots the verifier nominated.
   * This is what the visualisation renders — every state here is computed.
   */
  router.get('/resume', (req, res) => {
    const trustedRoots = rootsFromQuery(req.query.roots);
    const claims = evaluateResume(trustedRoots);
    res.json({
      subject: { name: state.subject.name, did: state.subject.did },
      trustedRoots: trustedRoots.map((id) => ({ id, name: state.registry.entity(id)?.name || id })),
      availableRoots: state.registry.roots().map((r) => ({ id: r.id, name: r.name })),
      summary: {
        authoritative: claims.filter((c) => c.state === 'auth').length,
        corroborative: claims.filter((c) => c.state === 'corro').length,
        selfAsserted: claims.filter((c) => c.state === 'self').length,
        unverified: claims.filter((c) => c.state === 'unverified').length
      },
      claims
    });
  });

  /** One claim, with the full chain walk spelled out hop by hop. */
  router.get('/claims/:claimPath', (req, res) => {
    const trustedRoots = rootsFromQuery(req.query.roots);
    const claim = evaluateClaim(state.registry, {
      subjectDid: state.subject.did,
      claimPath: req.params.claimPath,
      trustedRoots
    });
    claim.confidence = scoreConfidence(claim);
    res.json(claim);
  });

  /** Ask the resolver directly: can this entity attest this path under these roots? */
  router.post('/resolve', (req, res) => {
    const { entityId, claimPath, roots, at } = req.body || {};
    if (!entityId || !claimPath) {
      return res.status(400).json({ error: 'entityId and claimPath are required' });
    }
    const result = resolveChain(state.registry, {
      entityId,
      claimPath,
      subjectDid: state.subject.did,
      trustedRoots: roots && roots.length ? roots : allRootIds(),
      at: at || new Date().toISOString()
    });
    return res.json(result);
  });

  // ---------------------------------------------------------------- badges

  router.post('/badges/build', (req, res) => {
    const { claimPaths, disclose = {}, audience, roots, expiresAt } = req.body || {};
    if (!audience) return res.status(400).json({ error: 'audience is required — badges are audience-bound' });

    const paths = claimPaths && claimPaths.length ? claimPaths : state.resume.map((r) => r.claimPath);
    const badge = buildBadge(state.registry, {
      subject: { did: state.subject.did, privateKey: state.subject.privateKey },
      claimPaths: paths,
      disclose,
      trustedRoots: roots && roots.length ? roots : allRootIds(),
      audience,
      expiresAt: expiresAt || null,
      allPaths: state.resume.map((r) => r.claimPath)
    });

    badges.set(badge.badgeId, badge);
    return res.json(badge);
  });

  router.post('/badges/verify', (req, res) => {
    const { badge, badgeId, audience } = req.body || {};
    const target = badge || badges.get(badgeId);
    if (!target) return res.status(404).json({ error: 'badge not found — pass `badge` or a known `badgeId`' });
    return res.json(verifyBadge(state.registry, target, { audience }));
  });

  // ------------------------------------------------------- room verification

  /** Create a short-lived QR link that attendees can verify independently. */
  router.post('/room/sessions', async (req, res, next) => {
    try {
      const { claimPaths, disclose = {}, expiresAt, baseUrl } = req.body || {};
      const sessionId = randomId('room');
      const paths = claimPaths && claimPaths.length ? claimPaths : state.resume.map((r) => r.claimPath);
      const audience = `room:${sessionId}`;
      const badge = buildBadge(state.registry, {
        subject: { did: state.subject.did, privateKey: state.subject.privateKey },
        claimPaths: paths,
        disclose,
        trustedRoots: allRootIds(),
        audience,
        expiresAt: expiresAt || null,
        allPaths: state.resume.map((r) => r.claimPath)
      });
      const verifyUrl = `${String(baseUrl || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '')}/verify.html?session=${encodeURIComponent(sessionId)}`;
      const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 2, width: 280 });

      badges.set(badge.badgeId, badge);
      roomSessions.set(sessionId, { badgeId: badge.badgeId, audience, verifyUrl, createdAt: new Date().toISOString() });

      return res.status(201).json({ sessionId, verifyUrl, qrDataUrl, expiresAt: badge.expiresAt, claimCount: badge.claims.length });
    } catch (error) {
      return next(error);
    }
  });

  /** Public attendee endpoint: each claim is re-verified when the QR is opened. */
  router.get('/room/sessions/:sessionId', (req, res) => {
    const session = roomSessions.get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'verification session not found' });
    const badge = badges.get(session.badgeId);
    if (!badge) return res.status(404).json({ error: 'verification badge not found' });
    return res.json({
      sessionId: req.params.sessionId,
      subject: { name: state.subject.name },
      verification: verifyBadge(state.registry, badge, { audience: session.audience }),
      claims: badge.claims.map(({ claimPath, disclosed, withheldFields }) => ({ claimPath, disclosed, withheldFields }))
    });
  });

  /** The subject invalidates a badge they issued, without touching the attestations. */
  router.post('/badges/:badgeId/invalidate', (req, res) => {
    const badge = badges.get(req.params.badgeId);
    if (!badge) return res.status(404).json({ error: 'badge not found' });
    state.registry.revoked.set(badge.badgeId, { id: badge.badgeId, at: new Date().toISOString(), reason: 'invalidated by subject' });
    return res.json({ badgeId: badge.badgeId, invalidated: true });
  });

  // ------------------------------------------------------------ revocation

  /** Revoke any accreditation or attestation and watch the affected claims degrade. */
  router.post('/revoke', (req, res) => {
    const { id, reason } = req.body || {};
    const entry = state.registry.revoke(id, reason);
    if (!entry) return res.status(404).json({ error: `no accreditation or attestation with id ${id}` });
    return res.json({ ...entry, affected: evaluateResume(allRootIds()).filter((c) => c.state !== 'auth').map((c) => c.claimPath) });
  });

  router.post('/unrevoke', (req, res) => {
    const { id } = req.body || {};
    return res.json({ id, restored: state.registry.unrevoke(id) });
  });

  // ----------------------------------------------------------- adversarial

  /** The 12 attack vectors. Each one must be rejected. */
  router.get('/adversarial', (req, res) => {
    res.json(runAdversarialSuite());
  });

  // ------------------------------------------------------------------ demo

  router.post('/demo/reset', (req, res) => {
    state = seed();
    badges.clear();
    res.json({ reset: true, entities: state.registry.entities.size });
  });

  return router;
}

module.exports = { createApi };
