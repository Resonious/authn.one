export async function sendVerificationEmail(email: string, origin: string, sessionID: DurableObjectId, env: AuthnOneEnv) {
  const verifyID = crypto.randomUUID();
  await env.USERS.put(`verify:${verifyID}`, sessionID.toString(), { expirationTtl: 60 * 60 });

  const verifyURL = new URL('/verify', env.APP_HOST);
  verifyURL.searchParams.set('session', verifyID);

  const originURL = new URL(origin);

  await sendEmail(env, {
    subject: `ログイン: ${origin}`,
    body: {
      html: `
${origin} へのログインをされる場合は、<a href="${verifyURL}">こちらをクリックしてください</a>。
<br><br>
<a href="${verifyURL}">${verifyURL}</a>
<br><br>
このログイン試行に心当たりがない場合は、このメールを無視していただいて構いません。
`.trim(),
      text: `
${origin} へのログインをされる場合は、以下のリンクをクリックしてください：
\n
${verifyURL}
\n
このログイン試行に心当たりがない場合は、このメールを無視していただいて構いません。
`.trim(),
    },
    to: email,
    from: {
      email: `auth@authn.one`,
      name: `authn.one`,
    },
  });
}

type SendArgs = {
  subject: string,
  body: {
    html: string,
    text: string,
  }
  to: string,
  from: {
    email: string,
    name: string,
  }
};

async function sendEmail(env: AuthnOneEnv, args: SendArgs) {
  if (env.ENV === 'development') {
    console.log(`EMAIL ${args.from.email} -> ${args.to} "${args.subject}"\n${args.body.text}`);
		return;
  }

	const headers = {
		'content-type': 'application/json',
		'accept': 'application/json',
		'authorization': `Bearer ${env.FASTMAIL_API_KEY}`,
	};

	const session = await fetch("https://api.fastmail.com/.well-known/jmap", {
		method: 'GET',
		headers,
	}).then(x => x.json<any>());
	const apiUrl = session['apiUrl']
	const accountId = session['primaryAccounts']['urn:ietf:params:jmap:submission']
	console.log(apiUrl, accountId);

	const mailboxQuery = {
		using: ["urn:ietf:params:jmap:submission", "urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
		methodCalls: [
			['Mailbox/query', {
				accountId,
				filter: { role: 'drafts' },
			}, 'drafts'],
			['Identity/get', {
				accountId,
			}, 'identity'],
		]
	};

	const queryResponse = await fetch(apiUrl, { method: 'POST', body: JSON.stringify(mailboxQuery), headers });
	const { methodResponses } = await queryResponse.json<any>();
	const [drafts] = methodResponses.find((r: any) => r[2] === "drafts")[1]["ids"];
	const identities = methodResponses.find((r: any) => r[2] === "identity")[1]["list"];
	const identity = identities.find((i: any) => i["email"] === args.from.email);
	if (!identity) {
		throw new Error("Cannot send from configured address");
	}
	const sent = identity["saveSentToMailboxId"]

	// Create the email
	const createEmail = {
		using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission'],
		methodCalls: [
			['Email/set', {
				accountId,
				create: {
					email1: {
						mailboxIds: {
							[sent]: true,
						},
						from: [args.from],
						to: [{ email: args.to }],
						subject: args.subject,
						textBody: [{
							partId: '1'
						}],
						htmlBody: [{
							partId: '2'
						}],
						bodyValues: {
							'1': {
								value: args.body.text
							},
							'2': {
								value: args.body.html
							}
						}
					}
				}
			}, '0'],
		]
	};

	const emailResponses = (await fetch(apiUrl, { method: 'POST', body: JSON.stringify(createEmail), headers }).then(x => x.json<any>()))['methodResponses']
	console.log(emailResponses);
	console.log(emailResponses[0][1].notCreated);
	// TODO: the email is being marked as "not created". maybe because of how I'm putting in html
	const id = emailResponses[0][1].created.email1.id;

	// Send the email
	const submission = {
		using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission'],
		methodCalls: [
			['EmailSubmission/set', {
				accountId,
				create: {
					notif: {
						identityId: identity["id"],
						emailId: id,
					}
				}
			}, '0'],
		]
	};
	const sendResponses = (await fetch(apiUrl, { method: 'POST', body: JSON.stringify(submission), headers }).then(x => x.json<any>()))['methodResponses'];
	const created = sendResponses[0][1]['created']['notif'];
	if (!created) {
		throw new Error("Failed to send");
	}
}
