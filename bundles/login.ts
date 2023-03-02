import { client } from '@passwordless-id/webauthn';
import { PostChallengeResponse } from '../src/index';
import '../src/types.d';

const AUTHN_ONE = '{{ AUTHN_ONE }}                                   '.trim();

class AuthnOneElement extends HTMLElement {
  initialState(root: DocumentFragment, errorMessage?: string) {
    if (root.querySelector('form')) return;

    root.getElementById('main')!.innerHTML = `
      <form id="form">
        <label>
          <span>Email Address</span>
          <input placeholder="test@example.com" id="email" type="email">
        </label>

        <div class="buttons">
          <button
            type="button"
            class="b register"
            id="register"
          >New Passkey</button>
          <button
            type="submit"
            class="b signin"
            id="sign-in"
          >Sign In</button>
        </div>
      </form>
    `;
    root.getElementById('form')!
        .addEventListener('submit', this.signin.bind(this, root));
    root.getElementById('register')!
        .addEventListener('click', this.signup.bind(this, root));
    (root.getElementById('email') as HTMLInputElement).value = this.email ?? '';

    if (errorMessage) {
      const error = document.createElement('p');
      error.textContent = errorMessage;
      error.style.color = 'red';
      root.getElementById('main')!.prepend(error);
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

        * {
          box-sizing: border-box;
        }

        #main {
          width: 400px;

          padding: 30px;
          border: 1px solid #dadce0;
        }

        form {
          display: flex;
          flex-direction: column;

          gap: 10px;
        }

        label {
          font-size: 14px;
        }

        input {
          width: 100%;
          padding: 10px;
          border: 1px solid #dadce0;
          border-radius: 4px;
        }

        .buttons {
          display: flex;
          justify-content: space-between;
        }

        .b {
          padding: 10px;
          border-radius: 4px;
          cursor: pointer;
        }
        .b:hover {
          background: #dadce0;
        }
        .b:active {
          background: #dadce0;
        }

        .register {
          background: none;
          border: none;
        }

        .signin {
          border: 1px solid #dadce0;
          background: #1a73e8;
          color: white;
        }
        .signin:hover {
          background: #2456df;
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

  // Always registers new credentials. Can be used to add new credentials to an
  // existing user, or to register a new user. What's the difference!?
  async signup(root: ShadowRoot, _event: Event) {
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
  async signin(root: ShadowRoot, event: SubmitEvent) {
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

  // 1st step: get challenge and existing credentials for an email address
  async begin(root: ShadowRoot) {
    const emailInput = root.getElementById('email')! as HTMLInputElement;
    const email = emailInput.value;

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
  shakeField(input) {
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

    const registration = await client.register(email, challenge, {
      authenticatorType: 'both',
    });

    const registerResult = await authnFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ challenge, registration }),
    });
    if (registerResult.status >= 300) {
      throw new Error(await registerResult.text());
    }

    // TODO: maybe websocket wait for verification? or what?
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
