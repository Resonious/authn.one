interface AuthnOneEnv {
  USERS: KVNamespace,
  USER: DurableObjectNamespace,
  SESSION: DurableObjectNamespace,
  WEBSITE: DurableObjectNamespace,
  APP_HOST: string,
}

// Pasted in from passwordless-id because they don't export their own types
interface CredentialKey {
  id: string;
  publicKey: string;
  algorithm: 'RS256' | 'ES256';
}
interface RegistrationEncoded {
  username: string;
  credential: CredentialKey;
  authenticatorData: string;
  clientData: string;
  attestationData?: string;
}