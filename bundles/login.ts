import { client } from '@passwordless-id/webauthn';
import { PostChallengeResponse } from '../src/index';
import '../src/types.d';

const AUTHN_ONE = '{{ AUTHN_ONE }}                                   '.trim();

class AuthnOneElement extends HTMLElement {
  static get observedAttributes() {
    return ['email', 'theme'];
  }

  attributeChangedCallback(name: string, _oldValue: string | null, newValue: string | null) {
    const root = this.shadowRoot;
    if (!root) return;

    if (name === 'email') {
      const emailInput = root.getElementById('email') as HTMLInputElement | null;
      if (!emailInput) return;
      if (newValue) emailInput.value = newValue;
      emailInput.disabled = !!newValue;
    }

    else if (name === 'theme') {
      if (newValue === 'dark') {
        root.getElementById('main')!.classList.add('dark');
      } else {
        root.getElementById('main')!.classList.remove('dark');
      }
    }
  }

  initialState(root: DocumentFragment, errorMessage?: string) {
    if (root.querySelector('form')) return;
    const quickLogin = this.hasAttribute('quick');

    if (quickLogin) {
      root.getElementById('main')!.innerHTML = `
        <div class="buttons center">
          <button
            type="button"
            class="b signin"
            id="sign-in"
          >Quick Log In</button>
        </div>
      `;
      root.getElementById('sign-in')!
          .addEventListener('click', this.quickSignin.bind(this, root));
    } else {
      root.getElementById('main')!.innerHTML = `
        <form id="form">
          <label>
            <span>Email Address</span>
            <input placeholder="test@example.com" id="email" type="email">
          </label>

          <div class="buttons">
            <button
              type="submit"
              class="b signin"
              id="sign-in"
            >Log In</button>
            <button
              type="button"
              class="b register"
              id="register"
            >Having Trouble?</button>
          </div>
        </form>
      `;
      root.getElementById('form')!
          .addEventListener('submit', e => this.signin(root, e));
      root.getElementById('register')!
          .addEventListener('click', e => this.signup(root, e));

      const emailAttr = this.getAttribute('email');
      if (emailAttr) {
        this.attributeChangedCallback('email', null, emailAttr);
      } else {
        // Save last email for convenience
        const emailElement = root.getElementById('email')! as HTMLInputElement;
        emailElement.addEventListener('change', (event) => {
          const el = event.target as HTMLInputElement;
          window.localStorage.setItem('_authn.one-email', el.value);
        });
        const lastEmail = window.localStorage.getItem('_authn.one-email');
        if (lastEmail) {
          emailElement.value = lastEmail;
        }
      }
    }

    if (errorMessage) {
      if (errorMessage.match(/The operation either timed out or was not allowed/)) return;

      const error = document.createElement('p');
      error.textContent = errorMessage;
      error.style.color = 'red';
      root.getElementById('main')!.prepend(error as any);
    }
  }

  loadingState(root: DocumentFragment) {
    root.getElementById('main')!.replaceChildren('Authenticating...');
  }

  emailVerificationState(root: DocumentFragment) {
    root.getElementById('main')!.innerHTML = `
      <p>We sent a verification email to <span id="email"></span>.
      Please open the message and click the link.</p>
    `;
    root.getElementById('email')!.textContent = this.email ?? 'unknown@unknown';
  }

  doneState(root: DocumentFragment) {
    root.getElementById('main')!.innerHTML = `<p>Authenticated ✅</p>`;
  }

  challenge?: string;
  email?: string;
  state: 'initial' | 'session-in-progress' | 'awaiting-verification' = 'initial';
  checkInterval?: number;
  check?: () => Promise<void>;

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });

    shadowRoot.innerHTML = `
      <style>
        :host {
          --text-color: #000;
          --bg-color: #fff;
          --border-color: #dadce0;

          font-family: sans-serif;
          display: block;
          padding: 25px;
          font-size: 14px;
        }

        * {
          box-sizing: border-box;
        }

        #main {
          width: 100%;
          max-width: 400px;

          padding: 30px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
          background: var(--bg-color);
          color: var(--text-color);
        }

        @media (max-width: 300px) {
          #main {
            padding: 15px;
          }
        }

        #main.dark {
          --text-color: #fff;
          --bg-color: #333;
          --border-color: #999;
        }

        form {
          display: flex;
          flex-direction: column;

          gap: 10px;
        }

        input {
          width: 100%;
          padding: 10px;
          border: 1px solid var(--border-color);
          border-radius: 4px;
        }

        input[disabled] {
          border: none;
        }

        .buttons {
          display: flex;
          justify-content: space-between;

          flex-wrap: wrap;
        }

        .b {
          padding: 10px;
          border-radius: 4px;
          cursor: pointer;
          border: none;
        }
        .b:hover {
          background: var(--border-color);
        }
        .b:active {
          background: var(--border-color);
        }

        .register {
          background: none;
          border: none;
          color: var(--text-color);
        }

        .signin {
          background: #1a73e8;
          color: white;
        }
        .signin:hover {
          background: #2456df;
        }

        .center {
          justify-content: center;
        }

        .shake {
          animation: shake 0.44s cubic-bezier(.36,.07,.19,.97) both;
        }

        @keyframes shake {
          0% { transform: translateX(0); }
          10% { transform: translateX(-5px); }
          30% { transform: translateX(5px); }
          50% { transform: translateX(-5px); }
          70% { transform: translateX(5px); }
          90% { transform: translateX(-5px); }
          100% { transform: translateX(0); }
        }
      </style><div id="main"></div>`

    this.initialState(shadowRoot);
  }

  connectedCallback() {
    AuthnOneElement.observedAttributes.forEach((attr) => {
      const value = this.getAttribute(attr);
      if (value) this.attributeChangedCallback(attr, null, value);
    });
  }

  disconnectedCallback() {
    this.stopChecking();
  }

  // Always registers new credentials. Can be used to add new credentials to an
  // existing user, or to register a new user. What's the difference!?
  async signup(root: DocumentFragment, _event: Event) {
    if (!client.isAvailable()) {
      alert("Your browser doesn't support the security features required to sign in.");
      return;
    }

    const result = await this.begin(root);
    if (result === null) return;

    // Immediately authenticate
    await this.register()
      .then(() => { this.emailVerificationState(root) })
      .catch((e) => { this.initialState(root, e.toString()) });
  }

  // This is effectively a "sign in or up". If the user has no credentials, we
  // just register them fresh.
  async signin(root: DocumentFragment, event: SubmitEvent) {
    event.preventDefault();
    if (!client.isAvailable()) {
      alert("Your browser doesn't support the security features required to sign in.");
      return;
    }

    const credentialIDs = await this.begin(root);
    if (credentialIDs === null) return;
    console.log(credentialIDs);

    if (credentialIDs.length !== 0) {
      await this.authenticate(credentialIDs)
        .then(() => { this.doneState(root) })
        .catch((e) => { this.initialState(root, e.toString()) });
    } else {
      await this.register()
        .then(() => { this.emailVerificationState(root) })
        .catch((e) => { this.initialState(root, e.toString()) });
    }
  }

  async quickSignin(_: any) {
    alert('not implemented yet');
  }

  // 1st step: get challenge and existing credentials for an email address
  async begin(root: DocumentFragment) {
    const emailInput = root.getElementById('email')! as HTMLInputElement;
    const email = this.getAttribute('email') ?? emailInput.value;

    if (!email) {
      return this.shakeField(emailInput);
    }

    this.loadingState(root);
    const { credentialIDs, challenge } = await authnFetch('/challenge', {
      method: 'POST',
      body: JSON.stringify({ email })
    }).then(r => r.json() as Promise<PostChallengeResponse>);

    this.challenge = challenge;
    this.email = email;

    return credentialIDs;
  }

  // Shakes an element to indicate an error
  shakeField(input: HTMLInputElement) {
    input.focus();
    input.classList.add('shake');
    input.addEventListener('animationend', () => {
      input.classList.remove('shake');
    }, { once: true });

    return null;
  }

  // 2nd step register once verified
  async register() {
    const { challenge, email } = this;
    if (!challenge || !email) {
      throw new Error('register() called without challenge or email');
    }

    const registration = await client.register({
	    hints: ["client-device"],
			user: email,
			challenge,
		});

    const registerResult = await authnFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ challenge, registration }),
    });
    if (registerResult.status >= 300) {
      throw new Error(await registerResult.text());
    }

    // At this point we wait for verification
    this.stopChecking();
    this.check = async () => {
      if (!this.challenge) return this.stopChecking();

      const { authenticated } = await authnFetch(`/check/${this.challenge}`, {
        method: 'GET'
      }).then(r => r.json() as Promise<{ authenticated: boolean }>);

      if (authenticated) {
        this.stopChecking();
        this.complete();
      }
    };

    // @ts-ignore because TS thinks this is NodeJS.Timer right now
    this.checkInterval = setInterval(this.check, 10000);
    window.addEventListener('focus', this.check);
  }

  // For users who've already registered in the past
  async authenticate(credentials: string[]) {
    const { challenge, email } = this;
    if (!challenge || !email) {
      throw new Error('register() called without challenge or email');
    }

		const authentication = await client.authenticate({
			challenge,
			credentialIds: credentials,
		} as any);

    const authenticateResponse = await authnFetch('/authenticate', {
      method: 'POST',
      body: JSON.stringify({ challenge, authentication }),
    });
    if (authenticateResponse.status >= 300) {
      const result = await authenticateResponse.json() as any;
      if (result.error) {
        throw new Error(result.error);
      } else {
        throw new Error('Auth service returned ' + authenticateResponse.status);
      }
    }

    this.complete();
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

  // This means we successfully authenticated
  complete() {
    if (!this.challenge) throw new Error('complete() called without challenge');
    if (this.shadowRoot) this.doneState(this.shadowRoot);

    const form = document.createElement('form') as HTMLFormElement;
    form.action = `/signin/${encodeURIComponent(this.challenge)}`;
    form.method = 'POST';
    form.style.display = 'none';
    document.body.append(form as any);
    form.submit();
  }

  stopChecking() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      delete this.checkInterval;
    }
    if (this.check) {
      window.removeEventListener('focus', this.check);
      delete this.check;
    }
  }
}

function authnFetch(path: string, request: RequestInit) {
  const headers = new Headers(request.headers);
  if (request.method === 'POST') {
    headers.set('content-type', 'application/json');
  }

  return fetch(`${AUTHN_ONE}${path}`, {
    ...request,
    headers,
    credentials: 'omit',
  }).then(r => {
    if (r.status >= 300) {
      throw new Error(`authn.one error: ${r.status} ${r.statusText} ${r.url}`)
    }
    return r;
  });
}

// Polyfill for getPublicKey (not available on Firefox 110)
if (!AuthenticatorAttestationResponse.prototype['getPublicKey']) {
  import(`${AUTHN_ONE}/polyfill.js`);
}

customElements.define('authn-one', AuthnOneElement);
