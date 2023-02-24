class AuthnOneElement extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot!.innerHTML = `
      <style>
        :host {
          display: block;
          padding: 25px;
          color: var(--authn-one-text-color, #000);
        }
      </style>
      <h2>Authn One</h2>
      <slot></slot>
    `;
  }
}

customElements.define('authn-one', AuthnOneElement);