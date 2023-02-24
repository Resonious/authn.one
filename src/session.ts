export type SessionInit = {
  email: string,
  challenge: string,
  origin: string,
}

export class Session implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;

    // Self destruct after 24 hours of inactivity
    state.storage.getAlarm().then(alarm => {
      if (alarm) return;
      state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /init
    // sets the challenge nonce and origin for this session
    if (request.method === 'POST' && url.pathname === '/init') {
      const { email, challenge, origin } = await request.json() as SessionInit;
      await Promise.all([
        this.state.storage.put('email', email),
        this.state.storage.put('challenge', challenge),
        this.state.storage.put('origin', origin),
      ]);
      return new Response('', { status: 204 });
    }

    // POST /consume
    // returns everything set by /init and destroys the session
    if (request.method === 'POST' && url.pathname === '/consume') {
      const [ email, challenge, origin ] = await Promise.all([
        this.state.storage.get<string>('email'),
        this.state.storage.get<string>('challenge'),
        this.state.storage.get<string>('origin'),
      ])
      if (!email || !challenge || !origin) {
        return new Response('{"error":"session not yet initialized"}', { status: 404 });
      }

      // Self destruct
      this.state.storage.setAlarm(Date.now());

      return new Response(JSON.stringify({
        email, challenge, origin
      }), { status: 200 });
    }

    return new Response('{"error":"unknown path"}', { status: 404 });
  }

  // Self-destruct on alarm!!
  async alarm(): Promise<void> {
    console.log(`Deleting session ${this.state.id}`);
    await this.state.storage.deleteAll();
  }
}