export interface UserEmail {
  email: string,
  verifiedAt: number | null,
  primary?: boolean,
}

export interface UserInfo {
  id: string,
  emails: UserEmail[],
  credentials: CredentialKey[],
  createdAt: number,
}

export interface FetchedUser {
  dobj: DurableObjectStub,
  info: UserInfo,
}

export class User implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;

    // Initialize data
    state.storage.get<UserEmail[]>('emails').then(emails => {
      if (!emails) state.storage.put('emails', []);
    });
    state.storage.get<CredentialKey[]>('credentials').then(creds => {
      if (!creds) state.storage.put('credentials', []);
    });
    state.storage.get<number>('createdAt').then(createdAt => {
      if (!createdAt) state.storage.put('createdAt', Date.now());
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /verify
    // Comes from the Session object when a new user is verified
    if (request.method === 'POST' && url.pathname === '/verify') {
      const { email } = await request.json<{ email: string }>();

      await Promise.all([
        this.addEmail(email, true),
      ]);

      return new Response('', { status: 204 });
    }

    // POST /credential
    // New credential registered
    // We have to be careful this only happens either *right after email verification*
    // or after confirming that the user is already authenticated with another cred.
    if (request.method === 'POST' && url.pathname === '/credential') {
      const [{ credential }, credentials] = await Promise.all([
        await request.json<{ credential: CredentialKey }>(),
        this.state.storage.get<CredentialKey[]>('credentials').then(x => x ?? []),
      ]);

      // Check if credential already exists, add if not
      if (!credentials.find(x => x.id === credential.id)) {
        credentials.push(credential);
        await this.state.storage.put('credentials', credentials);
      }
      return new Response('', { status: 204 });
    }

    // GET /info
    // Just returns info of a verified user. null if not verified yet.
    if (request.method === 'GET' && url.pathname === '/info') {
      const [emails, credentials, createdAt] = await Promise.all([
        this.state.storage.get<UserEmail[]>('emails').then(x => x ?? []),
        this.state.storage.get<CredentialKey[]>('credentials').then(x => x ?? []),
        this.state.storage.get<number>('createdAt').then(x => x ?? 0),
      ]);
      const result: UserInfo = {
        id: this.state.id.toString(),
        emails,
        credentials,
        createdAt,
      };

      if (createdAt) return new Response(JSON.stringify(result), { status: 200 });
      else return new Response('null', { status: 404 });
    }

    return new Response('{"error":"unknown path"}', { status: 404 });
  }

  async addEmail(email: string, verified: boolean = false) {
    const emails = (await this.state.storage.get<UserEmail[]>('emails')) ?? [];
    const existing = emails.find(x => x.email === email);

    console.log('Adding email', email, 'to', this.state.id.toString(), 'verified?', verified, 'existing?', existing);

    if (existing && verified) {
      existing.verifiedAt = Date.now();
    }
    else if (!existing) {
      emails.push({
        email,
        primary: emails.length === 0,
        verifiedAt: verified ? Date.now() : null,
      });
    }
    else return;

    return await this.state.storage.put('emails', emails);
  }

  // TODO self destruct if not verified after awhile?
}

export async function emailToUserKey(email: string) {
  const emailHash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  const emailHashB64 = btoa(String.fromCharCode(...new Uint8Array(await emailHash)));
  return `email:${emailHashB64}`;
}

// Returns a user durable object stub ONLY if a verified user exists under the given email address
export async function getVerifiedUserFromEmail(email: string, env: AuthnOneEnv): Promise<FetchedUser | null> {
  const user = await getUserFromEmail(email, env);
  if (!user) return null;
  const infoRequest = await user.fetch('https://user/info', { method: 'GET' })
  if (infoRequest.status >= 300) throw new Error('User broken? ' + email);
  const info = await infoRequest.json<UserInfo>();
  if (!info) return null;

  if (userIsVerified(info, email)) return { dobj: user, info };
  else return null;
}

export async function getUserFromEmail(email: string, env: AuthnOneEnv): Promise<DurableObjectStub | null> {
  const userID = await env.USERS.get(await emailToUserKey(email));
  if (!userID) return null;
  return env.USER.get(await env.USER.idFromString(userID));
}

export function userIsVerified(user: UserInfo | null, email: string): boolean {
  if (!user) return false;
  return user.emails.find(x => x.email === email)?.verifiedAt != null;
}