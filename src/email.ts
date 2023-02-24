export async function sendVerificationEmail(host: string, email: string, sessionID: DurableObjectId) {
  const verifyURL = new URL('/verify', host);
  verifyURL.searchParams.set('session', sessionID.toString());

  // TODO: use mailchannels in production

  console.log(`To ${email}, verify at ${verifyURL}`);
}