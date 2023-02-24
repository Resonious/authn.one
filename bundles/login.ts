import { client } from '@passwordless-id/webauthn';

const AUTHN_ONE = '{{ AUTHN_ONE }}                                   '.trim();

class AuthnOneElement extends HTMLElement {
  initialState(root: ShadowRoot) {
    if (root.querySelector('form')) return;

    root.innerHTML = `
      <style>
        :host {
          font-family: sans-serif;
          display: block;
          padding: 25px;
          color: var(--authn-one-text-color, #000);
        }
      </style>
      <form id="form">
        <input placeholder="test@example.com" id="email" type="email">
        <button type="submit" id="sign-in">Sign In</button>
      </form>
    `;
    root.getElementById('form')!
        .addEventListener('submit', this.signin.bind(this, root));
  }

  loadingState(root: ShadowRoot) {
    root.querySelectorAll('form').forEach(e => e.remove());
    root.append('Authenticating...');
  }

  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });
    this.initialState(shadowRoot);
  }

  async signin(root: ShadowRoot, event: SubmitEvent) {
    event.preventDefault();
    if (!client.isAvailable()) {
      alert("Your browser doesn't support the security features required to sign in.");
      return;
    }

    try {
      const email = (root.getElementById('email')! as HTMLInputElement).value;
      const origin = new URL(window.location.href).host;

      this.loadingState(root);

      const { existingUser, challenge } = await authnFetch('/challenge', {
        method: 'POST',
        body: JSON.stringify({ email: email })
      }).then(r => r.json());

      if (existingUser) {
        alert('Oh I know you...');
      }
      else {
        const registration = await client.register(email, challenge, {
          debug: true,
          authenticatorType: 'both',
        });
        console.log('SUCCESS!!!!!!!');
        const registerResult = await authnFetch('/register', {
          method: 'POST',
          body: JSON.stringify({ challenge, registration }),
        }).then(r => r.json());
        console.log(registerResult);

        this.emit('login', { userId: 'haha not yet' })
      }
    } finally {
      this.initialState(root);
    }
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