export type SessionInit = {
  challenge: string,
  origin: string,
}

export class Session implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Self destruct after 24 hours of inactivity
    this.state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);

    // POST /init
    // sets the challenge nonce and origin for this session
    if (request.method === 'POST' && url.pathname === '/init') {
      const { challenge, origin } = await request.json() as SessionInit;
      await Promise.all([
        this.state.storage.put('challenge', challenge),
        this.state.storage.put('origin', origin),
      ]);
      return new Response('', { status: 204 });
    }

    return new Response('???', { status: 404 });
  }

  // Self-destruct on alarm!!
  async alarm(): Promise<void> {
    console.log(`Deleting session ${this.state.id}`);
    await this.state.storage.deleteAll();
  }
}