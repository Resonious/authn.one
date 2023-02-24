import { client } from '@passwordless-id/webauthn';

const AUTHN_ONE = '{{ AUTHN_ONE }}                                   '.trim();

class AuthnOneElement extends HTMLElement {
  constructor() {
    super();
    const shadowRoot = this.attachShadow({ mode: "open" });
    shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 25px;
          color: var(--authn-one-text-color, #000);
        }
      </style>
      <h2>Authn One</h2>
      <input id="email" type="email">
      <button id="sign-in">Sign In</button>
      <slot></slot>
    `;
    shadowRoot.getElementById('sign-in')!
              .addEventListener('click', this.signIn.bind(this, shadowRoot));
  }

  async signIn(root: ShadowRoot) {
    if (!client.isAvailable()) {
      alert("Your browser doesn't support the security features required to sign in.");
      return;
    }
    const email = root.getElementById('email')! as HTMLInputElement;
    const origin = new URL(window.location.href).host;

    const { existingUser, challenge } = await authnFetch('/challenge', {
      method: 'POST',
      body: JSON.stringify({ email: email.value })
    }).then(r => r.json());

    if (existingUser) {
      alert('Oh I know you...');
    }
    else {
      const registration = await client.register(email.value, challenge, {
        debug: true,
        authenticatorType: 'both',
      });
      console.log('SUCCESS!!!!!!!');
    }
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
  });
}

customElements.define('authn-one', AuthnOneElement);