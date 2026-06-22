export function base64urlToBuffer(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

export function bufferToBase64url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export function registrationPublicKeyOptions(options: Record<string, unknown>) {
  const user = options.user as { id: string };
  const excludeCredentials = Array.isArray(options.excludeCredentials)
    ? options.excludeCredentials
    : [];
  return {
    ...options,
    challenge: base64urlToBuffer(String(options.challenge ?? '')),
    user: {
      ...user,
      id: base64urlToBuffer(user.id),
    },
    excludeCredentials: excludeCredentials.map((credential) => ({
      ...(credential as Record<string, unknown>),
      id: base64urlToBuffer(
        String((credential as Record<string, unknown>).id ?? ''),
      ),
    })),
  } as PublicKeyCredentialCreationOptions;
}

export function serializeRegistrationCredential(
  credential: PublicKeyCredential,
) {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    credential: {
      id: credential.id,
      rawId: bufferToBase64url(credential.rawId),
      type: credential.type,
      response: {
        attestationObject: bufferToBase64url(response.attestationObject),
        clientDataJSON: bufferToBase64url(response.clientDataJSON),
      },
    },
    transports: response.getTransports?.() ?? [],
  };
}

export function authenticationPublicKeyOptions(
  options: Record<string, unknown>,
) {
  return {
    ...options,
    challenge: base64urlToBuffer(String(options.challenge ?? '')),
  } as PublicKeyCredentialRequestOptions;
}

export function serializeAssertionCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      authenticatorData: bufferToBase64url(response.authenticatorData),
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
  };
}
