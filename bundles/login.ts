import { client } from '@passwordless-id/webauthn';
import { PostChallengeResponse } from '../src/index';
import '../src/types.d';

const AUTHN_ONE = '{{ AUTHN_ONE }}                                   '.trim();

class AuthnOneElement extends HTMLElement {
  initialState(root: ShadowRoot, errorMessage?: string) {
    if (root.querySelector('form')) return;

    root.getElementById('main')!.innerHTML = `
      <form id="form">
        <input placeholder="test@example.com" id="email" type="email">
        <button type="submit" id="sign-in">Sign In</button>
      </form>
    `;
    root.getElementById('form')!
        .addEventListener('submit', this.signin.bind(this, root));

    if (errorMessage) {
      const error = document.createElement('p');
      error.textContent = errorMessage;
      error.style.color = 'red';
      root.getElementById('main')!.prepend(error);
    }
  }

  loadingState(root: ShadowRoot) {
    root.getElementById('main')!.replaceChildren('Authenticating...');
  }

  emailVerificationState(root: ShadowRoot) {
    root.getElementById('main')!.innerHTML = `
      <p>We sent a verification email to <span id="email"></span>.
      Please open the message and click the link.</p>
    `;
    root.getElementById('email')!.textContent = this.email ?? 'unknown@unknown';
  }

  doneState(root: ShadowRoot) {
    root.getElementById('main')!.innerHTML = `<p>Authenticated ✅</p>`;
  }

  challenge?: string;
  email?: string;
  state: 'initial' | 'session-in-progress' | 'awaiting-verification' = 'initial';

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host {
          font-family: sans-serif;
          display: block;
          padding: 25px;
          color: var(--authn-one-text-color, #000);
        }
      </style><div id="main"></div>`

    this.initialState(shadowRoot);
  }

  async signin(root: ShadowRoot, event: SubmitEvent) {
    event.preventDefault();
    if (!client.isAvailable()) {
      alert("Your browser doesn't support the security features required to sign in.");
      return;
    }

    const email = (root.getElementById('email')! as HTMLInputElement).value;

    const { credentialIDs, challenge, verify } = await authnFetch('/challenge', {
      method: 'POST',
      body: JSON.stringify({ email })
    }).then(r => r.json() as Promise<PostChallengeResponse>);

    this.challenge = challenge;
    this.email = email;

    console.log(credentialIDs);

    if (credentialIDs.length !== 0) {
      await this.authenticate(credentialIDs)
        .then(() => { this.doneState(root) })
        .catch((e) => { this.initialState(root, e.toString()) });
    }
    else if (verify === 'inprogress') {
      this.emailVerificationState(root);
    } else if (verify === 'unnecessary') {
      this.loadingState(root);
      await this.register()
        .then(() => { this.doneState(root) })
        .catch((e) => { this.initialState(root, e.toString()) });
    } else {
      throw new Error('Unknown verify state');
    }
  }

  // 2nd step register once verified
  async register() {
    const { challenge, email } = this;
    if (!challenge || !email) {
      throw new Error('register() called without challenge or email');
    }

    const registration = await client.register(email, challenge, {
      authenticatorType: 'both',
    });

    const registerResult = await authnFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ challenge, registration }),
    }).then(r => r.json());

    this.emit('login', { userId: 'haha not yet' })
  }

  // For users who've already registered in the past
  async authenticate(credentials: string[]) {
    const { challenge, email } = this;
    if (!challenge || !email) {
      throw new Error('register() called without challenge or email');
    }

    // TODO: what happens if there are no credentials? must find out
    const authentication = await client.authenticate(credentials, challenge, {
      authenticatorType: 'both',
    });

    const authenticateResult = await authnFetch('/authenticate', {
      method: 'POST',
      body: JSON.stringify({ challenge, authentication }),
    }).then(r => r.json());
    console.log(authenticateResult);

    this.emit('login', { userId: 'haha not yet' })
  }

  // Emit an event, supporting on{name} attributes as well
  emit(name: string, detail: any) {
    const event = new CustomEvent(name, { detail });

    const attribute = this.getAttribute(`on${name}`);
    if (attribute) {
      const callback = new Function('event', attribute);
      try { callback.call(window, event); } catch (e) { console.error(e); }
    }

    this.dispatchEvent(new CustomEvent(name, {
      detail
    }));
  }
}

function authnFetch(path, request: RequestInit) {
  return fetch(`${AUTHN_ONE}${path}`, {
    ...request,
    headers: {
      'content-type': 'application/json',
      ...request.headers
    },
    credentials: 'omit',
  }).then(r => {
    if (r.status >= 300) {
      throw new Error(`authn.one error: ${r.status} ${r.statusText} ${r.url}`)
    }
    return r;
  });
}

customElements.define('authn-one', AuthnOneElement);
