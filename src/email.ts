// TODO: this is super bad. can't use session ID. must be new object
export async function sendVerificationEmail(email: string, sessionID: DurableObjectId, env: AuthnOneEnv) {
  const verifyID = crypto.randomUUID();
  await env.USERS.put(`verify:${verifyID}`, sessionID.toString(), { expirationTtl: 60 * 60 });

  const verifyURL = new URL('/verify', env.APP_HOST);
  verifyURL.searchParams.set('session', verifyID);

  // TODO: use mailchannels in production

  console.log(`To ${email}, verify at ${verifyURL}`);
}