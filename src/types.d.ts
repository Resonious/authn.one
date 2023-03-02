interface AuthnOneEnv {
  USERS: KVNamespace,
  USER: DurableObjectNamespace,
  SESSION: DurableObjectNamespace,
  APP_HOST: string,
  ENV: 'development' | 'production',
  DKIM_PRIVATE_KEY: string,
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
interface AuthenticationEncoded {
  credentialId: string
  authenticatorData: string
  clientData: string
  signature: string
}