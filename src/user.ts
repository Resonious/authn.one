export interface UserInfo {
  id: string,
  email: string,
  lastVerifiedAt: number,
}

export class User implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;
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