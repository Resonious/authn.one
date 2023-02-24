export interface UserInfo {
  id: string,
  emails: string[],
  lastVerifiedAt: number | null,
}

export class User implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;

    // Initialize data
    state.storage.get<string[]>('emails').then(emails => {
      if (!emails) state.storage.put('emails', []);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // GET /info
    // Just returns info of a verified user. null if not verified yet.
    if (request.method === 'GET' && url.pathname === '/info') {
      const info = await this.state.storage.get<string>('info');
      if (info) return new Response(info, { status: 200 });
      else return new Response('null', { status: 404 });
    }

    return new Response('{"error":"unknown path"}', { status: 404 });
  }

  // TODO self destruct if not verified after awhile?
}

export async function getUserFromEmail(email: string, env: AuthnOneEnv): Promise<DurableObjectStub | null> {
  const emailHash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(email));
  const emailHashB64 = btoa(String.fromCharCode(...new Uint8Array(await emailHash)));

  const userID = await env.USERS.get(`email:${emailHashB64}`);
  if (!userID) return null;
  return env.USER.get(await env.USER.idFromString(userID));
}