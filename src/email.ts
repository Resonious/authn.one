export async function sendVerificationEmail(email: string, origin: string, sessionID: DurableObjectId, env: AuthnOneEnv) {
  const verifyID = crypto.randomUUID();
  await env.USERS.put(`verify:${verifyID}`, sessionID.toString(), { expirationTtl: 60 * 60 });

  const verifyURL = new URL('/verify', env.APP_HOST);
  verifyURL.searchParams.set('session', verifyID);

  let fromName = origin.split('.').slice(0, -1).join('-');
  if (!fromName) fromName = origin;

  await sendEmail(env, {
    subject: `Verify your login to ${origin}`,
    body: {
      html: `
Click <a href="${verifyURL}">here</a> to verify your login to ${origin}
<br><br>
<a href="${verifyURL}">${verifyURL}</a>
<br><br>
Only click the above link if you are currently trying to log in to ${origin}.<br>
If this doesn't ring a bell, you can safely ignore this email.
`.trim(),
      text: `
Visit the following URL to verify your login to ${origin}:
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
      name: `Authentication @ ${origin}`,
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

  const email = await fetch('https://api.mailchannels.net/tx/v1/send', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: args.to }],
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