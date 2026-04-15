function base64UrlToArrayBuffer(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const binary = window.atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function isAndroidChromeCredentialManager() {
  const userAgent = String(navigator?.userAgent || '').toLowerCase();
  return userAgent.includes('android') && (userAgent.includes('chrome') || userAgent.includes('crios'));
}

function normalizeCredential(credential) {
  const response = credential?.response || {};
  return {
    id: credential.id,
    rawId: arrayBufferToBase64Url(credential.rawId),
    type: credential.type,
    authenticatorAttachment: credential.authenticatorAttachment || null,
    response: {
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      attestationObject: response.attestationObject ? arrayBufferToBase64Url(response.attestationObject) : undefined,
      authenticatorData: response.authenticatorData ? arrayBufferToBase64Url(response.authenticatorData) : undefined,
      signature: response.signature ? arrayBufferToBase64Url(response.signature) : undefined,
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : undefined,
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
    clientExtensionResults: typeof credential.getClientExtensionResults === 'function'
      ? credential.getClientExtensionResults()
      : {},
  };
}

export function isPlatformPasskeySupported() {
  return Boolean(window.PublicKeyCredential && navigator?.credentials);
}

export async function isLocalPlatformAuthenticatorAvailable() {
  if (!isPlatformPasskeySupported()) {
    return false;
  }

  if (typeof window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable !== 'function') {
    return false;
  }

  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function buildCreateOptions(publicKeyOptions, mode = 'strict') {
  const excludeCredentials = Array.isArray(publicKeyOptions.excludeCredentials)
    ? publicKeyOptions.excludeCredentials.map((item) => {
      const normalized = { ...item, id: base64UrlToArrayBuffer(item.id) };
      if (mode === 'strict') {
        return { ...normalized, transports: ['internal'] };
      }
      return normalized;
    })
    : [];

  const next = {
    ...publicKeyOptions,
    challenge: base64UrlToArrayBuffer(publicKeyOptions.challenge),
    user: {
      ...publicKeyOptions.user,
      id: base64UrlToArrayBuffer(publicKeyOptions.user.id),
    },
  };

  if (excludeCredentials.length > 0) {
    next.excludeCredentials = excludeCredentials;
  }

  if (mode === 'strict') {
    next.authenticatorSelection = {
      ...(publicKeyOptions.authenticatorSelection || {}),
      authenticatorAttachment: 'platform',
      residentKey: 'required',
      userVerification: 'required',
    };
    next.hints = Array.isArray(publicKeyOptions.hints) && publicKeyOptions.hints.length > 0
      ? publicKeyOptions.hints
      : ['client-device'];
    return next;
  }

  next.pubKeyCredParams = [{ type: 'public-key', alg: -7 }];
  // Android Credential Manager is more reliable with a minimal create payload.
  delete next.authenticatorSelection;
  delete next.hints;

  return next;
}

function buildGetOptions(publicKeyOptions, mode = 'strict') {
  const allowCredentials = Array.isArray(publicKeyOptions.allowCredentials)
    ? publicKeyOptions.allowCredentials.map((item) => {
      const normalized = { ...item, id: base64UrlToArrayBuffer(item.id) };
      if (mode === 'strict') {
        return { ...normalized, transports: ['internal'] };
      }
      return normalized;
    })
    : [];

  const next = {
    ...publicKeyOptions,
    challenge: base64UrlToArrayBuffer(publicKeyOptions.challenge),
    userVerification: publicKeyOptions.userVerification || 'required',
  };

  if (allowCredentials.length > 0) {
    next.allowCredentials = allowCredentials;
  }

  if (mode === 'strict') {
    next.hints = Array.isArray(publicKeyOptions.hints) && publicKeyOptions.hints.length > 0
      ? publicKeyOptions.hints
      : ['client-device'];
  }

  return next;
}

function normalizePasskeyError(error, actionLabel) {
  const rawMessage = String(error?.message || '').trim();
  const normalized = rawMessage.toLowerCase();
  const originalName = String(error?.name || '').trim();
  const withOriginalMetadata = (nextError) => {
    if (originalName) {
      nextError.name = originalName;
    }
    if (rawMessage) {
      nextError.rawMessage = rawMessage;
    }
    return nextError;
  };

  if (normalized.includes('unknown error occurred while talking to the credential manager')) {
    return withOriginalMetadata(new Error(
      `O gerenciador de credenciais do celular falhou ao ${actionLabel} a passkey. O aparelho recusou a operacao antes de concluir o cadastro. Verifique se o Gerenciador de senhas do Google esta ativo no Chrome e tente novamente.`,
    ));
  }

  if (normalized.includes('the operation either timed out or was not allowed')) {
    return withOriginalMetadata(new Error(
      actionLabel === 'cadastrar'
        ? 'O cadastro da nova passkey nao foi concluido neste aparelho. O gerenciador de credenciais cancelou ou recusou a criacao da chave de acesso para este dominio.'
        : 'A validacao da passkey nao foi concluida neste aparelho.',
    ));
  }
// a passkey ainda não está funcionando, o codigo acima é um principal suspeito, mas vamos tentar identificar outros cenários comuns para oferecer mensagens mais claras aos usuários.

  if (normalized.includes('notallowederror') || normalized.includes('not supported')) {
    return withOriginalMetadata(new Error(
      `O celular não ofereceu a biometria local para ${actionLabel} a passkey. Verifique se há bloqueio de tela ativo, biometria cadastrada e o gerenciador de senhas do Google habilitado no Chrome.`,
    ));
  }

  return error instanceof Error ? error : withOriginalMetadata(new Error(rawMessage || 'Falha ao processar a passkey.'));
}

export async function createPlatformPasskey(publicKeyOptions) {
  if (!isPlatformPasskeySupported()) {
    throw new Error('Este dispositivo nao suporta passkey biometrica.');
  }

  try {
    let credential;
    const preferCompatMode = isAndroidChromeCredentialManager();
    try {
      credential = await navigator.credentials.create({
        publicKey: buildCreateOptions(publicKeyOptions, preferCompatMode ? 'compat' : 'strict'),
      });
    } catch (firstError) {
      if (preferCompatMode) {
        throw firstError;
      }
      credential = await navigator.credentials.create({
        publicKey: buildCreateOptions(publicKeyOptions, 'compat'),
      });
    }

    return normalizeCredential(credential);
  } catch (error) {
    throw normalizePasskeyError(error, 'cadastrar');
  }
}

export async function getPlatformPasskeyAssertion(publicKeyOptions) {
  if (!isPlatformPasskeySupported()) {
    throw new Error('Este dispositivo nao suporta passkey biometrica.');
  }

  try {
    let credential;
    const preferCompatMode = isAndroidChromeCredentialManager();
    try {
      credential = await navigator.credentials.get({
        publicKey: buildGetOptions(publicKeyOptions, preferCompatMode ? 'compat' : 'strict'),
      });
    } catch (firstError) {
      if (preferCompatMode) {
        throw firstError;
      }
      credential = await navigator.credentials.get({
        publicKey: buildGetOptions(publicKeyOptions, 'compat'),
      });
    }

    return normalizeCredential(credential);
  } catch (error) {
    throw normalizePasskeyError(error, 'validar');
  }
}
// define a interface de comunicação com a API do backend para operações relacionadas à autenticação WebAuthn, como cadastro e validação de passkeys.