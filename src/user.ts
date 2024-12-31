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
    state.storage.get<string[]>('websites').then(sites => {
      if (!sites) state.storage.put('websites', []);
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
      const { email, origin, credential } = await request.json<{
        email: string,
        origin: string,
        credential: CredentialKey | null,
      }>();

      await Promise.all([
        this.addEmail(email, true),
        credential ? this.addCredential(credential, origin) : null,
      ]);

      return new Response('', { status: 204 });
    }

    // GET /info
    // Just returns info of a verified user. null if not verified yet.
    if (request.method === 'GET' && url.pathname === '/info') {
      const origin = url.searchParams.get('origin');

      const [emails, credentials, createdAt] = await Promise.all([
        this.state.storage.get<UserEmail[]>('emails').then(x => x ?? []),
        origin ? this.state.storage.get<CredentialKey[]>(`creds:${origin}`).then(x => x ?? []) : [],
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

  async addCredential(credential: CredentialKey, origin: string) {
    const key = `creds:${origin}`;
    const credentials = (await this.state.storage.get<CredentialKey[]>(key)) ?? [];

    // Check if credential already exists, add if not
    if (!credentials.find(x => x.id === credential.id)) {
      credentials.push(credential);
      await this.state.storage.put(key, credentials);
    }
  }

  // TODO self destruct if not verified after awhile?
}

export async function emailToUserKey(email: string) {
  const emailHash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  const emailHashB64 = btoa(String.fromCharCode(...new Uint8Array(await emailHash)));
  return `email:${emailHashB64}`;
}

// Returns a user durable object stub ONLY if a verified user exists under the given email address
export async function getVerifiedUserFromEmail(arg: { email: string, origin: string }, env: AuthnOneEnv): Promise<FetchedUser | null> {
  const user = await getUserFromEmail(arg.email, env);
  if (!user) return null;
  const url = new URL('https://user/info');
  url.searchParams.append('origin', arg.origin);
  const infoRequest = await user.fetch(url.toString(), { method: 'GET' })
  if (infoRequest.status >= 300) throw new Error('User broken? ' + arg.email + ' - ' + arg.origin);
  const info = await infoRequest.json<UserInfo>();
  if (!info) return null;

  if (userIsVerified(info, arg.email)) return { dobj: user, info };
  else return null;
}

export async function getUserFromEmail(email: string, env: AuthnOneEnv): Promise<DurableObjectStub | null> {
  const userID = await env.USERS.get(await emailToUserKey(email));
  if (!userID) return null;
  return env.USER.get(env.USER.idFromString(userID));
}

export function userIsVerified(user: UserInfo | null, email: string): boolean {
  if (!user) return false;
  return user.emails.find(x => x.email === email)?.verifiedAt != null;
}
