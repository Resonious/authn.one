export default {
	async fetch(request: Request) {
		let headersString = '';
		for (const [key, value] of request.headers) {
			headersString += `${key}: ${value}\n`
		}

		return new Response(headersString);
	},
};
