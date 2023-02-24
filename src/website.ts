export class Website implements DurableObject {
  state: DurableObjectState
  env: AuthnOneEnv

  constructor(state: DurableObjectState, env: AuthnOneEnv) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);


    return new Response('???', { status: 404 });
  }
}