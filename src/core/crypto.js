'use strict';

const crypto = require('node:crypto');

/**
 * Canonical JSON serialisation. Signing has to be deterministic: the same
 * logical payload must produce the same bytes on the issuer and the verifier,
 * regardless of key insertion order.
 */
function canonical(value) {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
}

/** Real Ed25519 keypair. No dependency — node:crypto supports it natively. */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return { publicKey, privateKey };
}

/** did:key-style identifier derived from the public key itself. No registry, no correlation handle. */
function didKey(publicKey) {
  const jwk = publicKey.export({ format: 'jwk' });
  return `did:key:z${jwk.x}`;
}

function sign(payload, privateKey) {
  return crypto.sign(null, Buffer.from(canonical(payload), 'utf8'), privateKey).toString('base64url');
}

function verify(payload, signature, publicKey) {
  if (!signature || !publicKey) return false;
  try {
    return crypto.verify(
      null,
      Buffer.from(canonical(payload), 'utf8'),
      publicKey,
      Buffer.from(signature, 'base64url')
    );
  } catch {
    return false;
  }
}

function contentHash(payload) {
  return crypto.createHash('sha256').update(canonical(payload)).digest('hex');
}

function randomId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

function nonce() {
  return crypto.randomBytes(16).toString('base64url');
}

module.exports = { canonical, generateKeyPair, didKey, sign, verify, contentHash, randomId, nonce };
