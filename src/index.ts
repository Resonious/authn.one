import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler';
import { server } from '@passwordless-id/webauthn';
import { SessionInit } from './session';
import { getUserFromEmail, getVerifiedUserFromEmail, UserInfo } from './user';
import { sendVerificationEmail } from './email';

export { User } from './user';
export { Session } from './session';

/*****************************************
 * BEGIN Cloudflare Sites boilerplate
 *****************************************/
// @ts-ignore
import manifestJSON from '__STATIC_CONTENT_MANIFEST'
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
  credentialIDs: string[],
}

export default {
  async fetch(request: Request, env: AuthnOneEnv, ctx: ExecutionContext) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return allowCORS(url, request, new Response('', {
        status: 204
      }));
    }

    let response: Response | null = await handleAPIRequest(url, request, env, ctx);
    if (!response) response = await handleBrowserRequest(url, request, env, ctx);

    return allowCORS(url, request, response);
  },
};

async function handleAPIRequest(url: URL, request: Request, env: AuthnOneEnv, ctx: ExecutionContext): Promise<Response | null> {
  // GET,POST /check/:challenge
  // requested by <authn-one> element when signing in
  if (url.pathname.startsWith('/check')) {
    const parts = url.pathname.split('/');
    const challenge = decodeURIComponent(parts[2]);

    // copypasta in authenticate
    const sessionID = env.SESSION.idFromName(challenge);
    const session = env.SESSION.get(sessionID);
    const sessionInfo = await session.fetch('https://session/info', {
      method: 'GET'
    }).then(r => r.json()) as SessionInit & { error: string };

    // This usually means session doesn't exist
    if (sessionInfo.error) {
      console.log('check', sessionInfo.error);
      ctx.waitUntil(session.fetch('https://session/destroy', { method: 'POST' }));
      return new Response('{"authenticated":false}', { status: 200 });
    }

    // This means the session does exist but hasn't been completed yet
    if (!sessionInfo.authenticatedUserID) {
      console.log('not authed yet', sessionID);
      return new Response('{"authenticated":false}', { status: 200 });
    }

    // If we got here, then the session IS authenticated.
    // POST requests will return the full session data and destroy the session.
    // GET requests will simply report authenticated: true
    if (request.method === 'POST') {
      ctx.waitUntil(session.fetch('https://session/destroy', { method: 'POST' }));
      return new Response(JSON.stringify({
        authenticated: true,
        origin: sessionInfo.origin,
        email: sessionInfo.email,
        user: sessionInfo.authenticatedUserID,
      }), { status: 200 });
    }
    else {
      return new Response('{"authenticated":true}', { status: 200 });
    }
  }

  // POST /challenge
  // requested by <authn-one> element when signing in
  if (request.method === 'POST' && url.pathname === '/challenge') {
    const origin = request.headers.get('origin');
    if (!origin) throw new Error('No origin in challenge request');
    const { email } = await request.json() as { email?: string };
    if (!email) throw new Error('No email in challenge request');

    const userInfoURL = new URL('https://user/info');
    userInfoURL.searchParams.append('origin', origin);
    const existingUser = await getUserFromEmail(email, env)
      .then(user => user && user.fetch(userInfoURL.toString(), { method: 'GET', }))
      .then(throwOnFail('user/info', 500))
      .then(r => r && r.json<UserInfo | null>());

    const credentialIDs = existingUser?.credentials.map(x => x.id) ?? [];

    console.log('challenge for', email, existingUser?.emails);

    const challenge = crypto.randomUUID();
    const sessionID = env.SESSION.idFromName(challenge);
    const session = env.SESSION.get(sessionID);
    const sessionInit: SessionInit = {
      email, challenge, origin,
      verify: 'notyet',
    };

    // Start a new session
    await session.fetch('https://session/init', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(sessionInit)
    }).then(throwOnFail('session/init'));

    const response: PostChallengeResponse = {
      challenge,
      credentialIDs,
    }
    return new Response(JSON.stringify(response), { status: 200 });
  }

  // POST /register
  // requested by <authn-one> element when registering
  if (request.method === 'POST' && url.pathname === '/register') {
    const origin = request.headers.get('origin');
    if (!origin) throw new Error('No origin in register request');
    const { challenge, registration } = await request.json() as {
      challenge: string,
      registration: RegistrationEncoded
    };

    // copypasta in authenticate
    const sessionID = env.SESSION.idFromName(challenge);
    const session = env.SESSION.get(sessionID);
    const sessionInfo = await session.fetch('https://session/info', {
      method: 'GET'
    }).then(r => r.json()) as SessionInit & { error: string };

    if (origin !== sessionInfo.origin) {
      console.error('Attempted registration from mismatched origin', origin, sessionInfo.origin);
      return new Response('{"error":"registration invalid"}', { status: 400 });
    }

    try {
      // verifyRegistration throws an error when the check fails
      await server.verifyRegistration(registration, {
        challenge: checkAgainstSession(sessionInfo, 'challenge'),
        origin: checkAgainstSession(sessionInfo, 'origin'),
      });
    } catch (e) {
      console.error(e);
      return new Response('{"error":"registration invalid"}', { status: 400 });
    }

    // OK, now that the credential is registered, we temporarily save it to the session
    // while we wait for the user to verify their email address.
    await session.fetch('https://session/credential', {
      method: 'POST',
      body: JSON.stringify(registration),
    }).then(throwOnFail('session/credential'));

    return new Response('', { status: 204 });
  }

  // POST /authenticate
  // requested by <authn-one> element when authenticating
  if (request.method === 'POST' && url.pathname === '/authenticate') {
    const origin = request.headers.get('origin');
    if (!origin) throw new Error('No origin in register request');
    const { challenge, authentication } = await request.json() as {
      challenge: string,
      authentication: AuthenticationEncoded
    };

    // copypasta of register
    const sessionID = env.SESSION.idFromName(challenge);
    const session = env.SESSION.get(sessionID);
    const sessionInfo = await session.fetch('https://session/info', {
      method: 'GET'
    }).then(r => r.json()) as SessionInit & { error: string };
    if (sessionInfo.error) {
      console.error('Authenticate attempt with errored session: ' + sessionInfo.error);
      return new Response('{"error":"authentication invalid"}', { status: 401 });
    }
    const user = await getVerifiedUserFromEmail(sessionInfo, env);
    if (!user) {
      console.error('Attempted authentication for non-existent or unverified user ' + sessionInfo.email);
      return new Response('{"error":"authentication invalid"}', { status: 401 });
    }
    const credential = user.info.credentials.find(x => x.id === authentication.credentialId);
    if (!credential) {
      console.error('Attempted authentication using invalid credentials ' + sessionInfo.email);
      return new Response('{"error":"authentication invalid"}', { status: 401 });
    }

    try {
      // verifyAuthentication throws an error when the check fails
      await server.verifyAuthentication(authentication, credential, {
        challenge: checkAgainstSession(sessionInfo, 'challenge'),
        origin: checkAgainstSession(sessionInfo, 'origin'),
        userVerified: true,
        counter: 0
      });

      await session.fetch('https://session/authenticated', {
        method: 'POST',
        body: JSON.stringify({ userID: user.info.id }),
      });

      return new Response('', { status: 204 });
    } catch (e) {
      console.error(e);
      return new Response('{"error":"authentication invalid"}', { status: 401 });
    }
  }

  // GET /verify
  // Linked to in verification email. Visiting this marks the user (and session) as verified.
  if (request.method === 'GET' && url.pathname === '/verify') {
    const verifyID = url.searchParams.get('session');
    const sessionID = await env.USERS.get(`verify:${verifyID}`);
    if (!verifyID || !sessionID) return new Response("You may have followed a bad link!", { status: 404 });

    const session = env.SESSION.get(env.SESSION.idFromString(sessionID));
    const response = await session.fetch('https://session/verify', { method: 'POST' });
    if (response.status >= 300) return new Response("You may have followed a bad link!", { status: 404 });
    return new Response("You're verified! You may close this window now.");
  }

  return null;
}

async function handleBrowserRequest(url: URL, request: Request, env: AuthnOneEnv, ctx: ExecutionContext) {
  const assetURL = new URL(request.url);

  const evt = () => ({
    request: new Request(assetURL.toString(), request),
    waitUntil: ctx.waitUntil.bind(ctx)
  });

  try {
    const secFetchDest = request.headers.get('sec-fetch-dest');

    if (secFetchDest === 'script') {
      if (url.pathname === '/') assetURL.pathname = '/login.js';
      let host = env.APP_HOST;

      const response = await getAssetFromKV(evt(), assetOptions(env, undefined));
      const js = await response.text();
      const js2 = js.replace(new RegExp(`{{ AUTHN_ONE }}\\s{${host.length - 15}}`), host);
      return new Response(js2, response);
    }

    else if (url.pathname === '/') {
      assetURL.pathname = '/index.html';
      return await getAssetFromKV(evt(), assetOptions(env, undefined));
    }

    return await getAssetFromKV(evt(), assetOptions(env, undefined));
  } catch (e) {
    if (e instanceof NotFoundError) {
      return new Response('Path not found: ' + assetURL.pathname, { status: 404 });
    } else if (e instanceof Error) {
      return new Response(e.message || e.toString(), { status: 500 });
    } else {
      return new Response('unknown error', { status: 500 });
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

function allowCORS(url: URL, request: Request, response: Response) {
  let headers: Headers;

  if (request.method === 'POST' || request.method === 'OPTIONS') {
    // POST /check/:challenge is the only non-CORS request
    if (url.pathname.startsWith('/check/')) return response;

    headers = new Headers({
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'OPTIONS, POST',
      'access-control-allow-headers': 'content-type',
    });
    const h = response.headers;
    const take = (k: string) => {
      const v = h.get(k);
      if (v !== null) headers.set(k, v);
    }
    take('accept');
    take('accept-language');
    take('content-type');
    take('range');
  }
  else {
    headers = response.headers;
    headers.append('access-control-allow-origin', '*');
  }

  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

// Used for verifying a registration or authentication via @passwordless-id/webauthn
function checkAgainstSession(info: SessionInit & { error: string }, field: keyof SessionInit) {
  return async (arg: string) => {
    if (info.error) return false;
    if (info[field] !== arg) return false;
    return true;
  }
}
