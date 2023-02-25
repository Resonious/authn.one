import { emailToUserKey } from "./user";

export type SessionInit = {
  email: string,
  challenge: string,
  origin: string,
  verify: 'inprogress' | 'unnecessary' | 'success',
}

export class Session implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;

    // Self destruct after 1 hour
    state.storage.getAlarm().then(alarm => {
      if (alarm) return;
      state.storage.setAlarm(Date.now() + 60 * 60 * 1000);
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /init
    // sets the challenge nonce and origin for this session
    if (request.method === 'POST' && url.pathname === '/init') {
      const { email, challenge, origin, verify } = await request.json() as SessionInit;
      await Promise.all([
        this.state.storage.put('email', email),
        this.state.storage.put('challenge', challenge),
        this.state.storage.put('origin', origin),
        this.state.storage.put('verify', verify),
      ]);
      return new Response('', { status: 204 });
    }

    // POST /verify
    // marks the session as verified, also saves this info in the user object
    if (request.method === 'POST' && url.pathname === '/verify') {
      const [verify, email] = await Promise.all([
        this.state.storage.get<string>('verify'),
        this.state.storage.get<string>('email'),
      ]);
      if (!email || !verify || verify === 'unnecessary') {
        return new Response('{"error":"bad verify"}', { status: 400 });
      }

      // Create or update user with newly verified email
      const key = await emailToUserKey(email);
      const userID = await this.env.USERS.get(key);
      let user;
      if (userID) {
        console.log('found user for verify', email, key, userID);
        const userDobjID = this.env.USER.idFromString(userID);
        user = this.env.USER.get(userDobjID);
      }
      else {
        console.log('making new user for verify', email, key);
        const newUserDobjID = this.env.USER.newUniqueId();
        await this.env.USERS.put(key, newUserDobjID.toString());
        user = this.env.USER.get(newUserDobjID);
      }
      const verifyResult = await user.fetch('https://user/verify', {
        method: 'POST',
        body: JSON.stringify({ email })
      });
      if (verifyResult.status >= 300) {
        return new Response('{"error":"verify failed for unknown reason"}', { status: 500 });
      }

      await Promise.all([
        this.state.storage.put('verify', 'success'),
      ]);
      return new Response('', { status: 204 });
    }

    // POST /consume
    // returns everything set by /init and destroys the session
    if (request.method === 'POST' && url.pathname === '/consume') {
      const [ email, challenge, origin, verify ] = await Promise.all([
        this.state.storage.get<string>('email'),
        this.state.storage.get<string>('challenge'),
        this.state.storage.get<string>('origin'),
        this.state.storage.get<string>('verify'),
      ]);
      if (!email || !challenge || !origin) {
        return new Response('{"error":"session not yet initialized"}', { status: 404 });
      }

      // Self destruct
      this.state.storage.setAlarm(Date.now());

      return new Response(JSON.stringify({
        email, challenge, origin, verify
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