import { client } from '@passwordless-id/webauthn';
import { PostChallengeResponse } from '../src/index';
import '../src/types.d';

const AUTHN_ONE = '{{ AUTHN_ONE }}                                   '.trim();

class AuthnOneElement extends HTMLElement {
  initialState(root: ShadowRoot) {
    if (root.querySelector('form')) return;

    root.getElementById('main')!.innerHTML = `
      <form id="form">
        <input placeholder="test@example.com" id="email" type="email">
        <button type="submit" id="sign-in">Sign In</button>
      </form>
    `;
    root.getElementById('form')!
        .addEventListener('submit', this.signin.bind(this, root));
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

    const { existingUser, challenge, verify } = await authnFetch('/challenge', {
      method: 'POST',
      body: JSON.stringify({ email })
    }).then(r => r.json() as Promise<PostChallengeResponse>);

    this.challenge = challenge;
    this.email = email;

    if (existingUser) {
      alert('Oh I know you...');
    }
    else if (verify === 'inprogress') {
      // TODO: right here!! I guess email verification was sent, so we should show a message
      this.emailVerificationState(root);
    } else if (verify === 'unnecessary') {
      this.loadingState(root);
      await this.register()
        .then(() => { this.doneState(root) })
        .catch(() => { this.initialState(root) }); // TODO: show error message?
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
      debug: true,
      authenticatorType: 'both',
    });

    const registerResult = await authnFetch('/register', {
      method: 'POST',
      body: JSON.stringify({ challenge, registration }),
    }).then(r => r.json());
    console.log(registerResult);

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
    mode: 'cors',
    credentials: 'omit',
  }).then(r => {
    if (r.status >= 300) {
      throw new Error(`authn.one error: ${r.status} ${r.statusText} ${r.url}`)
    }
    return r;
  });
}

customElements.define('authn-one', AuthnOneElement);