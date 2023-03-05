export async function sendVerificationEmail(email: string, origin: string, sessionID: DurableObjectId, env: AuthnOneEnv) {
  const verifyID = crypto.randomUUID();
  await env.USERS.put(`verify:${verifyID}`, sessionID.toString(), { expirationTtl: 60 * 60 });

  const verifyURL = new URL('/verify', env.APP_HOST);
  verifyURL.searchParams.set('session', verifyID);

  const originURL = new URL(origin);
  let fromName = originURL.hostname.split('.').slice(0, -1).join('-');
  if (!fromName) fromName = originURL.hostname;

  await sendEmail(env, {
    subject: `Passwordless login: ${origin}`,
    body: {
      html: `
If you are trying to log into ${origin}, <a href="${verifyURL}">click here</a> to verify your login.
<br><br>
<a href="${verifyURL}">${verifyURL}</a>
<br><br>
If you don't recognize this login attempt, you can safely ignore this email.
`.trim(),
      text: `
If you are trying to log into ${origin}, follow the link below:
\n
${verifyURL}
\n
Only click the above link if you are currently trying to log in to ${origin}.
If this doesn't ring a bell, you can safely ignore this email.
`.trim(),
    },
    to: email,
    from: {
      email: `${fromName}@${new URL(env.APP_HOST).hostname}`,
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
  let emailEndpoint = 'https://api.mailchannels.net/tx/v1/send';

  if (env.ENV === 'development') {
    emailEndpoint = 'http://localhost:4567/tx/v1/send';
    console.log(`EMAIL ${args.from.email} -> ${args.to} "${args.subject}"\n${args.body.text}`);
  }

  const email = await fetch(emailEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: args.to }],
          dkim_domain: new URL(env.APP_HOST).hostname,
          dkim_selector: 'mailchannels',
          dkim_private_key: env.DKIM_PRIVATE_KEY,
        },
      ],
      from: args.from,
      subject: args.subject,
      content: [
        {
          type: 'text/plain',
          value: args.body.text,
        },
        {
          type: 'text/html',
          value: args.body.html
        },
      ],
    }),
  });

  if (email.status >= 300) {
    throw new Error(`Email failed: ${email.status} ${await email.text()}`);
  }
}