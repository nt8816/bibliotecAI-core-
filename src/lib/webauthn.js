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

function normalizePasskeyError(error, actionLabel) {
  const rawMessage = String(error?.message || '').trim();
  const normalized = rawMessage.toLowerCase();

  if (normalized.includes('unknown error occurred while talking to the credential manager')) {
    return new Error(
      `O gerenciador de credenciais do celular falhou ao ${actionLabel} a passkey. Ative bloqueio de tela/biometria do aparelho e tente novamente no Chrome atualizado.`,
    );
  }

  if (normalized.includes('the operation either timed out or was not allowed')) {
    return new Error(`A confirmação biométrica foi cancelada ou expirou ao ${actionLabel} a passkey.`);
  }

  return error instanceof Error ? error : new Error(rawMessage || 'Falha ao processar a passkey.');
}

export async function createPlatformPasskey(publicKeyOptions) {
  if (!isPlatformPasskeySupported()) {
    throw new Error('Este dispositivo nao suporta passkey biometrica.');
  }

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        ...publicKeyOptions,
        challenge: base64UrlToArrayBuffer(publicKeyOptions.challenge),
        user: {
          ...publicKeyOptions.user,
          id: base64UrlToArrayBuffer(publicKeyOptions.user.id),
        },
        excludeCredentials: Array.isArray(publicKeyOptions.excludeCredentials)
          ? publicKeyOptions.excludeCredentials.map((item) => ({
            ...item,
            id: base64UrlToArrayBuffer(item.id),
          }))
          : [],
      },
    });

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
    const credential = await navigator.credentials.get({
      publicKey: {
        ...publicKeyOptions,
        challenge: base64UrlToArrayBuffer(publicKeyOptions.challenge),
        allowCredentials: Array.isArray(publicKeyOptions.allowCredentials)
          ? publicKeyOptions.allowCredentials.map((item) => ({
            ...item,
            id: base64UrlToArrayBuffer(item.id),
          }))
          : [],
      },
    });

    return normalizeCredential(credential);
  } catch (error) {
    throw normalizePasskeyError(error, 'validar');
  }
}
