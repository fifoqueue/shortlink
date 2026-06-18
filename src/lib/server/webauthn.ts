import { createHash, randomBytes, webcrypto } from 'node:crypto';

export interface StoredPasskeyPublicKey {
  kty: 'EC' | 'RSA';
  alg: 'ES256' | 'RS256';
  crv?: 'P-256';
  x?: string;
  y?: string;
  n?: string;
  e?: string;
}

export interface RegistrationVerification {
  credentialId: string;
  publicKey: StoredPasskeyPublicKey;
  algorithm: number;
  counter: number;
}

interface CborReadResult {
  value: unknown;
  offset: number;
}

const coseKey = {
  kty: 1,
  alg: 3,
  crv: -1,
  x: -2,
  y: -3,
  n: -1,
  e: -2,
} as const;

export function randomChallenge() {
  return base64url(randomBytes(32));
}

export function base64url(value: Uint8Array | Buffer | string) {
  const buffer = Buffer.isBuffer(value)
    ? value
    : typeof value === 'string'
      ? Buffer.from(value)
      : Buffer.from(value);
  return buffer.toString('base64url');
}

export function base64urlToBytes(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

export function sha256Bytes(value: Uint8Array | string) {
  return new Uint8Array(createHash('sha256').update(value).digest());
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left[index] ^ right[index];
  }
  return diff === 0;
}

function concatBytes(...chunks: Uint8Array[]) {
  const output = new Uint8Array(
    chunks.reduce((total, chunk) => total + chunk.length, 0),
  );
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function readCborLength(data: Uint8Array, additional: number, offset: number) {
  if (additional < 24) return { length: additional, offset };
  if (additional === 24) return { length: data[offset], offset: offset + 1 };
  if (additional === 25) {
    return {
      length: new DataView(data.buffer, data.byteOffset + offset, 2).getUint16(
        0,
      ),
      offset: offset + 2,
    };
  }
  if (additional === 26) {
    return {
      length: new DataView(data.buffer, data.byteOffset + offset, 4).getUint32(
        0,
      ),
      offset: offset + 4,
    };
  }
  throw new Error('Unsupported CBOR length');
}

function readCbor(data: Uint8Array, startOffset = 0): CborReadResult {
  const initial = data[startOffset];
  const major = initial >> 5;
  const additional = initial & 0x1f;
  let offset = startOffset + 1;
  const lengthInfo = readCborLength(data, additional, offset);
  const length = lengthInfo.length;
  offset = lengthInfo.offset;

  if (major === 0) return { value: length, offset };
  if (major === 1) return { value: -1 - length, offset };
  if (major === 2) {
    return {
      value: data.slice(offset, offset + length),
      offset: offset + length,
    };
  }
  if (major === 3) {
    return {
      value: Buffer.from(data.slice(offset, offset + length)).toString('utf8'),
      offset: offset + length,
    };
  }
  if (major === 4) {
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const item = readCbor(data, offset);
      items.push(item.value);
      offset = item.offset;
    }
    return { value: items, offset };
  }
  if (major === 5) {
    const map = new Map<unknown, unknown>();
    for (let index = 0; index < length; index += 1) {
      const key = readCbor(data, offset);
      const value = readCbor(data, key.offset);
      map.set(key.value, value.value);
      offset = value.offset;
    }
    return { value: map, offset };
  }
  if (major === 7) {
    if (additional === 20) return { value: false, offset: startOffset + 1 };
    if (additional === 21) return { value: true, offset: startOffset + 1 };
    if (additional === 22) return { value: null, offset: startOffset + 1 };
  }
  throw new Error('Unsupported CBOR value');
}

function parseClientData(
  encoded: string,
  expectedType: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
) {
  const raw = base64urlToBytes(encoded);
  const json = JSON.parse(Buffer.from(raw).toString('utf8')) as {
    type?: string;
    challenge?: string;
    origin?: string;
  };
  if (
    json.type !== expectedType ||
    json.challenge !== challenge ||
    json.origin !== origin
  ) {
    throw new Error('Invalid WebAuthn client data');
  }
  return { raw, json };
}

function readCounter(authData: Uint8Array) {
  return new DataView(authData.buffer, authData.byteOffset + 33, 4).getUint32(
    0,
  );
}

function assertAuthenticatorData(
  authData: Uint8Array,
  rpId: string,
  requireAttestedCredential: boolean,
) {
  if (authData.length < 37) throw new Error('Invalid authenticator data');
  const rpIdHash = authData.slice(0, 32);
  if (!equalBytes(rpIdHash, sha256Bytes(rpId))) {
    throw new Error('Invalid WebAuthn relying party');
  }
  const flags = authData[32];
  if ((flags & 0x01) !== 0x01) throw new Error('User presence is required');
  if (requireAttestedCredential && (flags & 0x40) !== 0x40) {
    throw new Error('Credential data is missing');
  }
}

function coseToPublicKey(cose: Map<unknown, unknown>) {
  const kty = cose.get(coseKey.kty);
  const alg = cose.get(coseKey.alg);
  if (kty === 2 && alg === -7) {
    const crv = cose.get(coseKey.crv);
    const x = cose.get(coseKey.x);
    const y = cose.get(coseKey.y);
    if (crv !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
      throw new Error('Invalid ES256 credential key');
    }
    return {
      algorithm: -7,
      publicKey: {
        kty: 'EC',
        alg: 'ES256',
        crv: 'P-256',
        x: base64url(x),
        y: base64url(y),
      } satisfies StoredPasskeyPublicKey,
    };
  }
  if (kty === 3 && alg === -257) {
    const n = cose.get(coseKey.n);
    const e = cose.get(coseKey.e);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array)) {
      throw new Error('Invalid RS256 credential key');
    }
    return {
      algorithm: -257,
      publicKey: {
        kty: 'RSA',
        alg: 'RS256',
        n: base64url(n),
        e: base64url(e),
      } satisfies StoredPasskeyPublicKey,
    };
  }
  throw new Error('Unsupported passkey algorithm');
}

function parseRegistrationAuthData(authData: Uint8Array) {
  const credentialIdLength = new DataView(
    authData.buffer,
    authData.byteOffset + 53,
    2,
  ).getUint16(0);
  const credentialIdStart = 55;
  const credentialIdEnd = credentialIdStart + credentialIdLength;
  if (authData.length <= credentialIdEnd) {
    throw new Error('Invalid credential data');
  }
  const credentialId = authData.slice(credentialIdStart, credentialIdEnd);
  const cose = readCbor(authData, credentialIdEnd).value;
  if (!(cose instanceof Map)) throw new Error('Invalid credential key');
  return {
    credentialId: base64url(credentialId),
    ...coseToPublicKey(cose),
    counter: readCounter(authData),
  };
}

function parseAttestationObject(encoded: string) {
  const decoded = readCbor(base64urlToBytes(encoded)).value;
  if (!(decoded instanceof Map)) throw new Error('Invalid attestation object');
  const authData = decoded.get('authData');
  if (!(authData instanceof Uint8Array)) {
    throw new Error('Invalid attestation auth data');
  }
  return authData;
}

function es256DerToRaw(signature: Uint8Array) {
  let offset = 0;
  if (signature[offset] !== 0x30) throw new Error('Invalid ECDSA signature');
  offset += 2;
  if (signature[offset] !== 0x02) throw new Error('Invalid ECDSA signature');
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset += 2 + rLength;
  if (signature[offset] !== 0x02) throw new Error('Invalid ECDSA signature');
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);
  const raw = new Uint8Array(64);
  raw.set(r.slice(Math.max(0, r.length - 32)), 32 - Math.min(32, r.length));
  raw.set(s.slice(Math.max(0, s.length - 32)), 64 - Math.min(32, s.length));
  return raw;
}

async function verifySignature(
  publicKey: StoredPasskeyPublicKey,
  signature: Uint8Array,
  data: Uint8Array,
) {
  if (publicKey.kty === 'EC') {
    const key = await webcrypto.subtle.importKey(
      'jwk',
      { ...publicKey, ext: true } as JsonWebKey,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
    return webcrypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      es256DerToRaw(signature),
      data,
    );
  }
  const key = await webcrypto.subtle.importKey(
    'jwk',
    { ...publicKey, ext: true } as JsonWebKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  return webcrypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
}

export function registrationOptions(input: {
  challenge: string;
  rpId: string;
  rpName: string;
  userId: number;
  userName: string;
  displayName: string;
  excludeCredentialIds: string[];
}) {
  return {
    challenge: input.challenge,
    rp: { id: input.rpId, name: input.rpName },
    user: {
      id: base64url(String(input.userId)),
      name: input.userName,
      displayName: input.displayName,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    timeout: 60_000,
    attestation: 'none',
    excludeCredentials: input.excludeCredentialIds.map((id) => ({
      id,
      type: 'public-key',
    })),
    authenticatorSelection: {
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'preferred',
    },
  };
}

export function authenticationOptions(input: {
  challenge: string;
  rpId: string;
}) {
  return {
    challenge: input.challenge,
    rpId: input.rpId,
    timeout: 60_000,
    userVerification: 'preferred',
  };
}

export function verifyRegistrationResponse(input: {
  response: {
    rawId?: string;
    response?: { clientDataJSON?: string; attestationObject?: string };
  };
  challenge: string;
  origin: string;
  rpId: string;
}): RegistrationVerification {
  const clientData = input.response.response?.clientDataJSON;
  const attestationObject = input.response.response?.attestationObject;
  if (!input.response.rawId || !clientData || !attestationObject) {
    throw new Error('Invalid WebAuthn registration response');
  }
  parseClientData(clientData, 'webauthn.create', input.challenge, input.origin);
  const authData = parseAttestationObject(attestationObject);
  assertAuthenticatorData(authData, input.rpId, true);
  const credential = parseRegistrationAuthData(authData);
  if (credential.credentialId !== input.response.rawId) {
    throw new Error('Credential ID mismatch');
  }
  return credential;
}

export async function verifyAuthenticationResponse(input: {
  response: {
    rawId?: string;
    response?: {
      authenticatorData?: string;
      clientDataJSON?: string;
      signature?: string;
      userHandle?: string | null;
    };
  };
  publicKey: StoredPasskeyPublicKey;
  challenge: string;
  origin: string;
  rpId: string;
}) {
  const authenticatorData = input.response.response?.authenticatorData;
  const clientDataJSON = input.response.response?.clientDataJSON;
  const signature = input.response.response?.signature;
  if (
    !input.response.rawId ||
    !authenticatorData ||
    !clientDataJSON ||
    !signature
  ) {
    throw new Error('Invalid WebAuthn authentication response');
  }
  const response = input.response.response!;
  const clientData = parseClientData(
    clientDataJSON,
    'webauthn.get',
    input.challenge,
    input.origin,
  );
  const authData = base64urlToBytes(authenticatorData);
  assertAuthenticatorData(authData, input.rpId, false);
  const verified = await verifySignature(
    input.publicKey,
    base64urlToBytes(signature),
    concatBytes(authData, sha256Bytes(clientData.raw)),
  );
  if (!verified) throw new Error('Invalid WebAuthn signature');
  return {
    credentialId: input.response.rawId,
    counter: readCounter(authData),
    userHandle: response.userHandle
      ? Buffer.from(base64urlToBytes(response.userHandle)).toString('utf8')
      : '',
  };
}
