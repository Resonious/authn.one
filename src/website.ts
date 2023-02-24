export class Website implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // GET /user?email=...
    // gets user with given email address if it exists
    // TODO actually maybe we don't need this. can share user across websites info internally
    if (request.method === 'GET' && url.pathname === '/user') {
      const email = url.searchParams.get('email');
      const user = await this.state.storage.get<string>(`user:${email}`);
      if (!email || !user) {
        return new Response('null', { status: 404 });
      }
      return new Response(user, { status: 200 });
    }

    return new Response('???', { status: 404 });
  }
}