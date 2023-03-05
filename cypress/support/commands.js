// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add('login', (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add('drag', { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add('dismiss', { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite('visit', (originalFn, url, options) => { ... })

Cypress.Commands.add("addVirtualAuthenticator", () => {
  return Cypress.automation("remote:debugger:protocol", {
    command: "WebAuthn.enable",
    params: {},
  }).then((result) => {
    console.log("WebAuthn.enable", result);
    return Cypress.automation("remote:debugger:protocol", {
      command: "WebAuthn.addVirtualAuthenticator",
      params: {
        options: {
          protocol: "ctap2",
          transport: "internal",
          hasResidentKey: true,
          hasUserVerification: true,
          isUserVerified: true,
        },
      },
    }).then((result) => {
      console.log("WebAuthn.addVirtualAuthenticator", result);
      return result.authenticatorId;
    });
  });
});

Cypress.Commands.add("removeVirtualAuthenticator", (authenticatorId) => {
  return Cypress.automation("remote:debugger:protocol", {
    command: "WebAuthn.removeVirtualAuthenticator",
    params: {
      authenticatorId,
    },
  }).then((result) => {
    console.log("WebAuthn.removeVirtualAuthenticator", result);
  });
});