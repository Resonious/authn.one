import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler';
import { server } from '@passwordless-id/webauthn';
import { SessionInit } from './session';
import { getUserFromEmail, UserInfo } from './user';

export { User } from './user';
export { Session } from './session';
export { Website } from './website';

/*****************************************
 * BEGIN Cloudflare Sites boilerplate
 *****************************************/
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
import { sendVerificationEmail } from './email';
const assetManifest = JSON.parse(manifestJSON)

// @ts-ignore
function assetOptions(env, rest) {
  return Object.assign(
    {
      ASSET_NAMESPACE: env.__STATIC_CONTENT,
      ASSET_MANIFEST: assetManifest,
    },
    rest
  );
}
/*****************************************
 * END Cloudflare Sites boilerplate
 *****************************************/

export type PostChallengeResponse = {
  challenge: string,
  existingUser: UserInfo | null,
  verify: SessionInit['verify'],
}

export default {
  async fetch(request: Request, env: AuthnOneEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    // POST /challenge
    // requested by <authn-one> element when signing in
    if (request.method === 'POST' && url.pathname === '/challenge') {
      const origin = request.headers.get('origin');
      if (!origin) throw new Error('No origin in challenge request');
      const { email } = await request.json() as { email?: string };
      if (!email) throw new Error('No email in challenge request');

      const existingUser = await getUserFromEmail(email, env)
        .then(user => user && user.fetch('https://user/info', { method: 'GET', }))
        .then(throwOnFail('user/info', 500))
        .then(r => r && r.json<UserInfo | null>());

      const challenge = crypto.randomUUID();
      const sessionID = env.SESSION.idFromName(challenge);
      const session = env.SESSION.get(sessionID);
      const sessionInit: SessionInit = {
        email, challenge, origin,
        verify: existingUser?.lastVerifiedAt ? 'unnecessary' : 'inprogress'
      };

      // Start a new session
      await session.fetch('https://session/init', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(sessionInit)
      }).then(throwOnFail('session/init'));

      // Send verification email
      if (sessionInit.verify === 'inprogress') {
        sendVerificationEmail(env.APP_HOST, email, sessionID);
      }

      const response: PostChallengeResponse = {
        challenge,
        existingUser,
        verify: sessionInit.verify
      }
      return allowCors(new Response(JSON.stringify(response), { status: 200 }));
    }

    // POST /register
    // requested by <authn-one> element when registering
    // TODO: make sure this does not happen until user is already verified
    if (request.method === 'POST' && url.pathname === '/register') {
      const origin = request.headers.get('origin');
      if (!origin) throw new Error('No origin in register request');
      const { challenge, registration } = await request.json() as {
        challenge: string,
        registration: RegistrationEncoded
      };

      const sessionID = env.SESSION.idFromName(challenge);
      const session = env.SESSION.get(sessionID);
      const sessionInfo = session.fetch('https://session/consume', {
        method: 'POST'
      }).then(r => r.json()) as Promise<SessionInit & { error: string }>;

      // TODO: don't consume the session here - let the implementer's server do that.
      // ALSO: make sure verification is done before creating any users.

      const checkAgainstSession = (field: keyof SessionInit) => async (arg: string) => {
        const info = await sessionInfo;
        if (info.error) return false;
        if (info[field] !== arg) return false;
        return true;
      }

      try {
        sessionInfo.then(info => {
          console.log(info);
        })

        // verifyRegistration throws an error when the check fails
        await server.verifyRegistration(registration, {
          challenge: checkAgainstSession('challenge'),
          origin: checkAgainstSession('origin'),
        });

        // Great, so the registration is valid. Can return the user ID to frontend.
        // TODO actually fetch user id here. also make sure everything is secure...

        return new Response(JSON.stringify({ result: 'Registration succeeded! TODO: actually save user data?' }), { status: 200 });
      } catch (e) {
        console.error(e);
        return new Response(JSON.stringify({ error: 'Registration failed' }), { status: 400 });
      }
    }

    // GET /verify
    // Linked to in verification email. Visiting this marks the user (and session) as verified.
    if (request.method === 'GET' && url.pathname === '/verify') {
      const sessionID = url.searchParams.get('session');
      if (!sessionID) return new Response("You may have followed a bad link!", { status: 404 });

      const session = env.SESSION.get(env.SESSION.idFromString(sessionID));
      const response = await session.fetch('https://session/verify', { method: 'POST' });
      if (response.status >= 300) return new Response("You may have followed a bad link!", { status: 404 });
      return new Response("You're verified! You may close this window now.");
    }

    // GET/POST /test
    if (url.pathname === '/test') {
      // Dump headers for testing..
      let headersString = '';
      for (const [key, value] of request.headers) {
        headersString += `${key}: ${value}\n`
      }

      return new Response(headersString);
    }

    // everything else
    return await handleBrowserRequest(request, env, ctx);
  },
};

async function handleBrowserRequest(request: Request, env: AuthnOneEnv, ctx: ExecutionContext) {
  const url = new URL(request.url);
  const assetURL = new URL(request.url);

  const evt = () => ({
    request: new Request(assetURL.toString(), request),
    waitUntil: ctx.waitUntil.bind(ctx)
  });

  try {
    const secFetchDest = request.headers.get('sec-fetch-dest');

    if (url.pathname === '/' && secFetchDest === 'script') {
      assetURL.pathname = '/login.js';
      let host = `${assetURL.protocol}//${assetURL.host}`;

      const response = await getAssetFromKV(evt(), assetOptions(env, undefined));
      const js = await response.text();
      const js2 = js.replace('{{ AUTHN_ONE }}', host);
      return allowCors(new Response(js2, response));
    }

    else if (url.pathname === '/') {
      assetURL.pathname = '/example.html';
      return await getAssetFromKV(evt(), assetOptions(env, undefined));
    }

    return await getAssetFromKV(evt(), assetOptions(env, undefined));
  } catch (e) {
    if (e instanceof NotFoundError) {
      return new Response('Path not found: ' + assetURL.pathname, { status: 404 });
    } else if (e instanceof Error) {
      return new Response(e.message || e.toString(), { status: 500 });
    }
  }
}

function throwOnFail(name: string, threshold: number = 300) {
  return (response: Response | null) => {
    if (response && response.status >= threshold) {
      throw new Error(`Request to ${name} failed with status ${response.status}`);
    }
    return response;
  }
}

function allowCors(response: Response) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}