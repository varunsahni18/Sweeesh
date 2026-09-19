'use strict';

const { generateKeyPair, didKey, sign, verify, contentHash, randomId } = require('./crypto');
const { scopeAllows, scopeContains, normaliseScope } = require('./paths');

/**
 * The registry is the only shared state and it holds organisations and
 * signing entities only. No personal data lives here — see P1/P5.
 *
 * Three record types:
 *   entity        an organisation or a delegated human signer, with a key
 *   accreditation "this entity may attest these paths, until this date"
 *   attestation   one signed statement about a subject, targeting a claim path
 */
class Registry {
  constructor() {
    this.entities = new Map();
    this.accreditations = new Map();
    this.attestations = new Map();
    this.revoked = new Map(); // id -> { at, reason }
    this.relationships = []; // HR-issued peer/reporting facts
  }

  // ---------------------------------------------------------------- entities

  addEntity({ id, name, kind, role = null, parentHint = null, keyValidFrom = null, keyRetiredAt = null }) {
    const { publicKey, privateKey } = generateKeyPair();
    const entity = {
      id: id || randomId('ent'),
      name,
      kind, // root | register | institution | employer | person | subject
      role,
      parentHint,
      did: didKey(publicKey),
      publicKey,
      privateKey,
      // Key rotation with historical validity: signatures made under a retired
      // key still verify for the period the key was live, and only for it.
      keyValidFrom,
      keyRetiredAt,
      createdAt: new Date().toISOString()
    };
    this.entities.set(entity.id, entity);
    return entity;
  }

  entity(id) {
    return this.entities.get(id) || null;
  }

  // ---------------------------------------------------------- accreditations

  /** Issue an accreditation: `issuer` grants `subject` the right to attest `scope`. */
  issueAccreditation({ issuerId, subjectId, scope, validFrom, validUntil, maxDelegationDepth = 4, subjects = null }) {
    const issuer = this.entity(issuerId);
    const subject = this.entity(subjectId);
    if (!issuer) throw new Error(`unknown issuer ${issuerId}`);
    if (!subject) throw new Error(`unknown subject ${subjectId}`);

    const body = {
      type: 'Accreditation',
      issuer: issuer.did,
      subject: subject.did,
      scope: normaliseScope(scope),
      // Subject constraint: which people this delegate may attest about.
      // null means unconstrained; a manager is constrained to their reports.
      subjects,
      validFrom: validFrom || new Date(0).toISOString(),
      validUntil: validUntil || null,
      maxDelegationDepth
    };

    const record = {
      id: randomId('acc'),
      issuerId,
      subjectId,
      ...body,
      hash: contentHash(body),
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${issuer.did}#keys-1`,
        proofPurpose: 'assertionMethod',
        signatureValue: sign(body, issuer.privateKey)
      }
    };

    this.accreditations.set(record.id, record);
    return record;
  }

  verifyAccreditation(acc) {
    const issuer = this.entity(acc.issuerId);
    if (!issuer) return false;
    const body = {
      type: 'Accreditation',
      issuer: acc.issuer,
      subject: acc.subject,
      scope: acc.scope,
      subjects: acc.subjects,
      validFrom: acc.validFrom,
      validUntil: acc.validUntil,
      maxDelegationDepth: acc.maxDelegationDepth
    };
    return verify(body, acc.proof.signatureValue, issuer.publicKey);
  }

  /** Accreditations naming `entityId` as the delegate. */
  accreditationsFor(entityId) {
    return [...this.accreditations.values()].filter((a) => a.subjectId === entityId);
  }

  // ------------------------------------------------------------ attestations

  /**
   * Issue an attestation.
   *  mode 'authoritative' — signer acts under a delegation chain
   *  mode 'corroborative' — a peer with standing but no authority
   *  mode 'self-asserted' — the subject's own statement
   */
  issueAttestation({ attesterId, subjectDid, claimPath, claims, mode, issuedAt, validUntil = null, basis = null }) {
    const attester = this.entity(attesterId);
    if (!attester) throw new Error(`unknown attester ${attesterId}`);

    const body = {
      type: 'Attestation',
      attester: attester.did,
      subject: subjectDid,
      claimPath,
      claims,
      mode,
      basis,
      issuedAt: issuedAt || new Date().toISOString(),
      validUntil
    };

    const record = {
      id: randomId('att'),
      attesterId,
      ...body,
      hash: contentHash(body),
      proof: {
        type: 'Ed25519Signature2020',
        created: new Date().toISOString(),
        verificationMethod: `${attester.did}#keys-1`,
        proofPurpose: 'assertionMethod',
        signatureValue: sign(body, attester.privateKey)
      }
    };

    this.attestations.set(record.id, record);
    return record;
  }

  verifyAttestation(att) {
    const attester = this.entity(att.attesterId);
    if (!attester) return false;
    const body = {
      type: 'Attestation',
      attester: att.attester,
      subject: att.subject,
      claimPath: att.claimPath,
      claims: att.claims,
      mode: att.mode,
      basis: att.basis,
      issuedAt: att.issuedAt,
      validUntil: att.validUntil
    };
    return verify(body, att.proof.signatureValue, attester.publicKey);
  }

  attestationsForPath(subjectDid, claimPath) {
    return [...this.attestations.values()].filter(
      (a) => a.subject === subjectDid && a.claimPath === claimPath
    );
  }

  // ----------------------------------------------------------- relationships

  /**
   * HR-issued org-chart facts. `reporting` grants authority, `peer` grants only
   * standing to corroborate and does not chain.
   */
  addRelationship({ kind, orgId, aDid, bDid, from, to }) {
    const rel = { id: randomId('rel'), kind, orgId, aDid, bDid, from, to };
    this.relationships.push(rel);
    return rel;
  }

  overlapConfirmed(aDid, bDid) {
    return this.relationships.some(
      (r) =>
        r.kind === 'peer' &&
        ((r.aDid === aDid && r.bDid === bDid) || (r.aDid === bDid && r.bDid === aDid))
    );
  }

  // -------------------------------------------------------------- revocation

  revoke(id, reason = 'revoked by issuer') {
    if (!this.accreditations.has(id) && !this.attestations.has(id)) return null;
    const entry = { id, at: new Date().toISOString(), reason };
    this.revoked.set(id, entry);
    return entry;
  }

  unrevoke(id) {
    return this.revoked.delete(id);
  }

  isRevoked(id) {
    return this.revoked.has(id);
  }

  // ------------------------------------------------------------------ scopes

  scopeAllows(scope, path) {
    return scopeAllows(scope, path);
  }

  scopeContains(parent, child) {
    return scopeContains(parent, child);
  }

  roots() {
    return [...this.entities.values()].filter((e) => e.kind === 'root');
  }
}

module.exports = { Registry };
