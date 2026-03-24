export interface SecurityEnv {
  API_BASE_URL?: string;
  SECURITY_EMAIL_FROM?: string;
  SECURITY_EMAIL_FROM_NAME?: string;
  SECURITY_EMAIL_REPLY_TO?: string;
  MAILCHANNELS_ENDPOINT?: string;
}

export interface RiskContext {
  ip: string | null;
  userAgent: string | null;
  deviceType: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
export function base64UrlEncode(input: ArrayBuffer | Uint8Array) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function base64UrlDecode(value: string) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export async function sha256Base64Url(value: string | Uint8Array) {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value;
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return base64UrlEncode(hash);
}

export function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function randomDigits(length = 6) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => String(byte % 10)).join('');
}

export function getRequestOrigin(request: Request, env: SecurityEnv, bodyContext?: Record<string, unknown> | null) {
  const contextOrigin = String(bodyContext?.app_origin || bodyContext?.origin || '').trim();
  if (contextOrigin) return contextOrigin.replace(/\/+$/g, '');
  const headerOrigin = String(request.headers.get('origin') || '').trim();
  if (headerOrigin) return headerOrigin.replace(/\/+$/g, '');
  const appBase = String(env.API_BASE_URL || '').trim();
  if (appBase) return appBase.replace(/\/+$/g, '');
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function getRpId(origin: string) {
  try {
    return new URL(origin).hostname;
  } catch {
    return '';
  }
}

export function detectDeviceType(userAgent: string, explicit?: string | null) {
  const requested = String(explicit || '').trim().toLowerCase();
  if (requested === 'mobile' || requested === 'desktop') return requested;
  const agent = String(userAgent || '').toLowerCase();
  if (/android|iphone|ipad|ipod|mobile/i.test(agent)) return 'mobile';
  return 'desktop';
}

export function buildRiskContext(
  request: Request,
  bodyContext?: Record<string, unknown> | null,
) {
  const ip =
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    null;

  return {
    ip,
    userAgent: request.headers.get('user-agent') || null,
    deviceType: detectDeviceType(request.headers.get('user-agent') || '', String(bodyContext?.device_type || '')),
  } satisfies RiskContext;
}

export async function sendSecurityEmail(
  env: SecurityEnv,
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  const endpoint = String(env.MAILCHANNELS_ENDPOINT || 'https://api.mailchannels.net/tx/v1/send').trim();
  const fromEmail = String(env.SECURITY_EMAIL_FROM || 'no-reply@bibliotecai.app').trim();
  const fromName = String(env.SECURITY_EMAIL_FROM_NAME || 'BibliotecAI Security').trim();
  const replyTo = String(env.SECURITY_EMAIL_REPLY_TO || fromEmail).trim();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      reply_to: {
        email: replyTo,
        name: fromName,
      },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });

  if (!response.ok) {
    const payload = await response.text();
    throw new Error(payload || `Falha ao enviar email de seguranca (HTTP ${response.status}).`);
  }
}

function decodeLength(view: DataView, offset: number, additionalInfo: number) {
  if (additionalInfo < 24) return { length: additionalInfo, offset };
  if (additionalInfo === 24) return { length: view.getUint8(offset), offset: offset + 1 };
  if (additionalInfo === 25) return { length: view.getUint16(offset), offset: offset + 2 };
  if (additionalInfo === 26) return { length: view.getUint32(offset), offset: offset + 4 };
  throw new Error('CBOR com tamanho nao suportado.');
}

function decodeCborItem(bytes: Uint8Array, startOffset = 0): { value: unknown; offset: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const first = view.getUint8(startOffset);
  const majorType = first >> 5;
  const additionalInfo = first & 31;
  let offset = startOffset + 1;

  if (majorType === 0 || majorType === 1) {
    const decoded = decodeLength(view, offset, additionalInfo);
    const length = decoded.length;
    offset = decoded.offset;
    return {
      value: majorType === 0 ? length : -1 - length,
      offset,
    };
  }

  if (majorType === 2) {
    const decoded = decodeLength(view, offset, additionalInfo);
    const length = decoded.length;
    offset = decoded.offset;
    return {
      value: bytes.slice(offset, offset + length),
      offset: offset + length,
    };
  }

  if (majorType === 3) {
    const decoded = decodeLength(view, offset, additionalInfo);
    const length = decoded.length;
    offset = decoded.offset;
    return {
      value: textDecoder.decode(bytes.slice(offset, offset + length)),
      offset: offset + length,
    };
  }

  if (majorType === 4) {
    const decoded = decodeLength(view, offset, additionalInfo);
    const length = decoded.length;
    offset = decoded.offset;
    const items: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const parsed = decodeCborItem(bytes, offset);
      items.push(parsed.value);
      offset = parsed.offset;
    }
    return { value: items, offset };
  }

  if (majorType === 5) {
    const decoded = decodeLength(view, offset, additionalInfo);
    const length = decoded.length;
    offset = decoded.offset;
    const map = new Map<unknown, unknown>();
    for (let index = 0; index < length; index += 1) {
      const keyItem = decodeCborItem(bytes, offset);
      offset = keyItem.offset;
      const valueItem = decodeCborItem(bytes, offset);
      offset = valueItem.offset;
      map.set(keyItem.value, valueItem.value);
    }
    return { value: map, offset };
  }

  if (majorType === 7 && additionalInfo === 20) return { value: false, offset };
  if (majorType === 7 && additionalInfo === 21) return { value: true, offset };
  if (majorType === 7 && additionalInfo === 22) return { value: null, offset };

  throw new Error('CBOR contem tipo nao suportado.');
}

function parseAuthData(bytes: Uint8Array) {
  if (bytes.length < 37) {
    throw new Error('Authenticator data invalido.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const rpIdHash = bytes.slice(0, 32);
  const flags = view.getUint8(32);
  const signCount = view.getUint32(33, false);
  let offset = 37;
  let credentialId: Uint8Array | null = null;
  let cosePublicKey: Uint8Array | null = null;

  if (flags & 0x40) {
    offset += 16;
    const credentialIdLength = view.getUint16(offset, false);
    offset += 2;
    credentialId = bytes.slice(offset, offset + credentialIdLength);
    offset += credentialIdLength;
    const publicKeyParsed = decodeCborItem(bytes, offset);
    cosePublicKey = bytes.slice(offset, publicKeyParsed.offset);
  }

  return {
    rpIdHash,
    flags,
    signCount,
    credentialId,
    cosePublicKey,
  };
}

function coseEc2ToJwk(cosePublicKeyBytes: Uint8Array) {
  const decoded = decodeCborItem(cosePublicKeyBytes);
  if (!(decoded.value instanceof Map)) {
    throw new Error('Chave publica COSE invalida.');
  }

  const map = decoded.value;
  const keyType = Number(map.get(1));
  const algorithm = Number(map.get(3));
  const curve = Number(map.get(-1));
  const x = map.get(-2);
  const y = map.get(-3);

  if (keyType !== 2 || algorithm !== -7 || curve !== 1 || !(x instanceof Uint8Array) || !(y instanceof Uint8Array)) {
    throw new Error('Somente passkeys ES256/P-256 sao suportadas.');
  }

  return {
    kty: 'EC',
    crv: 'P-256',
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
    ext: true,
  };
}

function concatBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    output.set(part, offset);
    offset += part.length;
  });
  return output;
}

function derToRawEcdsaSignature(signature: Uint8Array, componentLength = 32) {
  if (signature.length < 8 || signature[0] !== 0x30) {
    throw new Error('Assinatura ECDSA DER invalida.');
  }

  let offset = 2;
  if (signature[1] & 0x80) {
    const lengthBytes = signature[1] & 0x7f;
    offset = 2 + lengthBytes;
  }

  if (signature[offset] !== 0x02) {
    throw new Error('Componente R ausente na assinatura ECDSA.');
  }
  const rLength = signature[offset + 1];
  const r = signature.slice(offset + 2, offset + 2 + rLength);
  offset = offset + 2 + rLength;

  if (signature[offset] !== 0x02) {
    throw new Error('Componente S ausente na assinatura ECDSA.');
  }
  const sLength = signature[offset + 1];
  const s = signature.slice(offset + 2, offset + 2 + sLength);

  const raw = new Uint8Array(componentLength * 2);
  raw.set(r.slice(Math.max(0, r.length - componentLength)), componentLength - Math.min(componentLength, r.length));
  raw.set(s.slice(Math.max(0, s.length - componentLength)), componentLength * 2 - Math.min(componentLength, s.length));
  return raw;
}

async function verifyRpIdHash(rpId: string, actualHash: Uint8Array) {
  const expectedHash = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(rpId)));
  if (expectedHash.length !== actualHash.length) return false;
  for (let index = 0; index < expectedHash.length; index += 1) {
    if (expectedHash[index] !== actualHash[index]) return false;
  }
  return true;
}

export async function verifyRegistrationResponse(input: {
  credential: Record<string, any>;
  expectedChallenge: string;
  expectedOrigin: string;
  rpId: string;
}) {
  const { credential, expectedChallenge, expectedOrigin, rpId } = input;
  const response = credential?.response || {};
  const clientDataJsonBytes = base64UrlDecode(String(response.clientDataJSON || ''));
  const clientData = JSON.parse(textDecoder.decode(clientDataJsonBytes));

  if (clientData.type !== 'webauthn.create') {
    throw new Error('Resposta de cadastro de passkey invalida.');
  }

  if (clientData.challenge !== expectedChallenge) {
    throw new Error('Challenge de cadastro invalido.');
  }

  if (String(clientData.origin || '').replace(/\/+$/g, '') !== expectedOrigin.replace(/\/+$/g, '')) {
    throw new Error('Origem do cadastro de passkey nao autorizada.');
  }

  const attestationObjectBytes = base64UrlDecode(String(response.attestationObject || ''));
  const attestation = decodeCborItem(attestationObjectBytes).value;
  if (!(attestation instanceof Map)) {
    throw new Error('Attestation object invalido.');
  }

  const authDataBytes = attestation.get('authData');
  if (!(authDataBytes instanceof Uint8Array)) {
    throw new Error('Authenticator data ausente.');
  }

  const parsed = parseAuthData(authDataBytes);
  if (!(parsed.flags & 0x01)) {
    throw new Error('A passkey precisa confirmar a presença do usuário.');
  }

  if (!parsed.credentialId || !parsed.cosePublicKey) {
    throw new Error('Dados da credencial nao encontrados.');
  }

  const rpIdValid = await verifyRpIdHash(rpId, parsed.rpIdHash);
  if (!rpIdValid) {
    throw new Error('RP ID invalido para a passkey.');
  }

  const publicKeyJwk = coseEc2ToJwk(parsed.cosePublicKey);

  return {
    credentialId: base64UrlEncode(parsed.credentialId),
    publicKeyJwk,
    counter: parsed.signCount,
    backedUp: Boolean(credential?.authenticatorAttachment),
    transports: Array.isArray(response.transports) ? response.transports : [],
  };
}

export async function verifyAuthenticationResponse(input: {
  credential: Record<string, any>;
  expectedChallenge: string;
  expectedOrigin: string;
  rpId: string;
  storedCredentialId: string;
  publicKeyJwk: JsonWebKey;
  previousCounter: number;
}) {
  const { credential, expectedChallenge, expectedOrigin, rpId, storedCredentialId, publicKeyJwk, previousCounter } = input;
  const response = credential?.response || {};
  const receivedCredentialId = String(credential?.id || '');
  if (receivedCredentialId !== storedCredentialId) {
    throw new Error('Credencial de passkey nao corresponde ao cadastro.');
  }

  const clientDataJsonBytes = base64UrlDecode(String(response.clientDataJSON || ''));
  const clientData = JSON.parse(textDecoder.decode(clientDataJsonBytes));

  if (clientData.type !== 'webauthn.get') {
    throw new Error('Resposta de autenticacao de passkey invalida.');
  }

  if (clientData.challenge !== expectedChallenge) {
    throw new Error('Challenge de autenticacao invalido.');
  }

  if (String(clientData.origin || '').replace(/\/+$/g, '') !== expectedOrigin.replace(/\/+$/g, '')) {
    throw new Error('Origem da autenticacao de passkey nao autorizada.');
  }

  const authenticatorData = base64UrlDecode(String(response.authenticatorData || ''));
  const parsed = parseAuthData(authenticatorData);
  if (!(parsed.flags & 0x01)) {
    throw new Error('A autenticação da passkey não confirmou a presença do usuário.');
  }

  const rpIdValid = await verifyRpIdHash(rpId, parsed.rpIdHash);
  if (!rpIdValid) {
    throw new Error('RP ID invalido para a autenticacao biometrica.');
  }

  if (previousCounter > 0 && parsed.signCount > 0 && parsed.signCount <= previousCounter) {
    throw new Error('Contador de seguranca da passkey invalido.');
  }

  const clientDataHash = new Uint8Array(await crypto.subtle.digest('SHA-256', clientDataJsonBytes));
  const signedPayload = concatBytes(authenticatorData, clientDataHash);
  const signature = base64UrlDecode(String(response.signature || ''));
  const key = await crypto.subtle.importKey(
    'jwk',
    publicKeyJwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  let verified = await crypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    signature,
    signedPayload,
  );

  if (!verified) {
    try {
      const rawSignature = derToRawEcdsaSignature(signature);
      verified = await crypto.subtle.verify(
        { name: 'ECDSA', hash: 'SHA-256' },
        key,
        rawSignature,
        signedPayload,
      );
    } catch {
      // Fall through to the final error below.
    }
  }

  if (!verified) {
    throw new Error('Assinatura da passkey inválida.');
  }

  return {
    counter: parsed.signCount,
  };
}
