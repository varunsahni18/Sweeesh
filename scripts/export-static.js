'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { seed } = require('../src/demo/seed');
const { evaluateClaim, scoreConfidence } = require('../src/core/evaluate');

const state = seed();
const trustedRoots = state.registry.roots().map((root) => root.id);
const claims = state.resume.map((row) => {
  const claim = evaluateClaim(state.registry, {
    subjectDid: state.subject.did,
    claimPath: row.claimPath,
    trustedRoots
  });
  claim.confidence = scoreConfidence(claim);
  const pick = (kinds) => claim.chain.find((hop) => kinds.includes(hop.toKind));
  return {
    id: row.id,
    claimPath: row.claimPath,
    label: row.label,
    y0: row.y0,
    y1: row.y1,
    state: claim.state === 'authoritative' ? 'auth'
      : claim.state === 'corroborative' ? 'corro'
        : claim.state === 'self-asserted' ? 'self' : 'unverified',
    fullState: claim.state,
    conf: claim.confidence,
    signers: [claim.signer, ...(claim.coSigners || [])].filter(Boolean).map((signer) => ({
      name: signer.name,
      role: signer.role,
      rel: signer.id === claim.signer?.id ? 'signed under delegation' : 'co-signed'
    })),
    peers: (claim.corroborators || []).map((peer) => ({
      name: peer.name,
      role: peer.role,
      rel: peer.rel,
      overlapConfirmed: peer.overlapConfirmed,
      weight: peer.weight
    })),
    inst: pick(['institution', 'employer'])?.toName || null,
    reg: pick(['register'])?.toName || null,
    root: pick(['root'])?.toName || null,
    chain: claim.chain.map((hop) => ({ from: hop.fromName, to: hop.toName, kind: hop.toKind })),
    claims: claim.claims,
    basis: claim.basis || null,
    authorityFailure: claim.authorityFailure || null
  };
});

const output = {
  subject: { name: state.subject.name, did: state.subject.did },
  trustedRoots: trustedRoots.map((id) => ({ id, name: state.registry.entity(id)?.name || id })),
  availableRoots: state.registry.roots().map((root) => ({ id: root.id, name: root.name })),
  summary: {
    authoritative: claims.filter((claim) => claim.state === 'auth').length,
    corroborative: claims.filter((claim) => claim.state === 'corro').length,
    selfAsserted: claims.filter((claim) => claim.state === 'self').length,
    unverified: claims.filter((claim) => claim.state === 'unverified').length
  },
  claims
};

const outputPath = path.join(__dirname, '..', 'Sweeesh', 'visualisation', 'resume.json');
fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${output.claims.length} resolved claims to ${outputPath}`);
