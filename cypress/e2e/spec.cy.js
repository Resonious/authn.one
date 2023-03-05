/// <reference types="cypress" />

describe('template spec', () => {
  context('with successful webauthn', () => {
    beforeEach(() => {
      cy.addVirtualAuthenticator().as('authenticatorId')
    })

    afterEach(() => {
      cy.get('@authenticatorId').then((authenticatorId) => {
        cy.removeVirtualAuthenticator(authenticatorId)
      })
    })

    it('signs me in first, then lets me log in freely', () => {
      const name = `test${Cypress._.random(0, 1e6)}`
      cy.visit('/')
      cy.get('#standard').shadow().find('#email').type(`${name}@example.com`)
      cy.get('#standard').shadow().contains('Log In').click()
      cy.get('#standard').shadow().find('#main').should('contain', `We sent a verification email to ${name}@example.com`)

      cy.request({
        url: `http://localhost:4567/emails/${name}`,
        method: 'GET',
        retryOnStatusCodeFailure: true,
      }).should((response) => {
        expect(response.status).to.eq(200)
        expect(response.body).to.have.length(1)
        expect(response.body[0].personalizations[0].to[0].email).to.eq(`${name}@example.com`)
      }).then(response => {
        const textContent = response.body[0].content.find(c => c.type === 'text/plain').value
        cy.log(textContent)
        const link = textContent.match(/http:\/\/[\w:-]+\/verify\?session=[a-zA-Z0-9-]+/m)[0]
        cy.log(link)

        return cy.request({
          url: link,
          method: 'GET'
        })
      }).should((response) => {
        expect(response.status).to.eq(200)
        expect(response.body).to.contain("You're verified!")
      })

      // On focus after clicking the verify link, we should be signed in
      cy.window().then((win) => {
        const focusEvent = new win.FocusEvent('focus')
        win.dispatchEvent(focusEvent)
      })

      cy.get('body').should('contain', 'You are authenticated')
      cy.get('body').should('contain', `"authenticated": false`)
      cy.get('body').should('contain', `"email": "${name}@example.com"`)

      // TODO: from here we can try signing in again to confirm that email verification
      // is no longer necessary.
      // but: WTF is going on with the final form submit? it takes ages
    })
  })
})