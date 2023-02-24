import { getAssetFromKV, NotFoundError } from '@cloudflare/kv-asset-handler'

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

export default {
	async fetch(request: Request, env: any, ctx: ExecutionContext) {
		if (request.url.endsWith('/test')) {
			// Dump headers for testing..
			let headersString = '';
			for (const [key, value] of request.headers) {
				headersString += `${key}: ${value}\n`
			}

			return new Response(headersString);
		}

		return await handleBrowserRequest(request, env, ctx);
	},
};

async function handleBrowserRequest(request: Request, env: any, ctx: ExecutionContext) {
  const assetURL = new URL(request.url);

	const secFetchDest = request.headers.get('sec-fetch-dest');
	if (secFetchDest === 'script') {
		assetURL.pathname = '/login.js';
	} else {
		assetURL.pathname = '/example.html';
	}

	const evt = {
    request: new Request(assetURL.toString(), request),
    waitUntil: ctx.waitUntil.bind(ctx)
  };

	try {
		const response = await getAssetFromKV(evt, assetOptions(env, undefined));
		response.headers.append('Access-Control-Allow-Origin', '*');
		return response;
	} catch (e) {
		if (e instanceof NotFoundError) {
			return new Response('Path not found: ' + assetURL.pathname, { status: 404 });
		} else if (e instanceof Error) {
			return new Response(e.message || e.toString(), { status: 500 });
		}
	}
}
