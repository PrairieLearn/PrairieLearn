import { html } from '@prairielearn/html';

import { HeadContents } from '../../../components/HeadContents.html.js';
import { Modal } from '../../../components/Modal.html.js';
import { Navbar } from '../../../components/Navbar.html.js';
import { type AuthnProvider, type Institution, type SamlProvider } from '../../../lib/db-types.js';

export function AdministratorInstitutionSaml({
  institution,
  samlProvider,
  institutionAuthenticationProviders,
  host,
  resLocals,
}: {
  institution: Institution;
  samlProvider: SamlProvider | null;
  institutionAuthenticationProviders: AuthnProvider[];
  host: string;
  resLocals: Record<string, any>;
}) {
  const hasSamlProvider = !!samlProvider;
  const hasEnabledSaml = institutionAuthenticationProviders.some((p) => p.name === 'SAML');

  const missingAttributeMappings =
    !samlProvider?.uid_attribute || !samlProvider?.uin_attribute || !samlProvider?.name_attribute;

  const issuer = `https://${host}/saml/institution/${institution.id}`;
  const metadataUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/metadata`;
  const assertionConsumerServiceUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/callback`;
  const testSamlUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/login?RelayState=test`;
  const testSamlStrictUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/login?RelayState=test,strict`;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'SAML - Institution Admin' })}
      </head>
      <body>
        ${Navbar({
          resLocals: { ...resLocals, institution },
          navbarType: 'administrator_institution',
          navPage: 'administrator_institution',
          navSubPage: 'saml',
        })}
        ${DeleteSamlConfigurationModal({ csrfToken: resLocals.__csrf_token })}

        <main id="content" class="container mb-4">
          ${hasSamlProvider && !hasEnabledSaml
            ? html`
                <div class="alert alert-warning">
                  <h2 class="h5">SAML single sign-on is not enabled</h2>
                  <p class="mb-0">
                    After <a href="${testSamlUrl}">testing your SAML configuration</a>, you must
                    visit the
                    <a href="${resLocals.urlPrefix}/sso">single sign-on configuration</a> page and
                    enable SAML authentication.
                  </p>
                </div>
              `
            : ''}
          ${hasSamlProvider && missingAttributeMappings
            ? html`
                <div class="alert alert-warning">
                  <h2 class="h5">Missing attribute mappings</h2>
                  <p class="mb-0">
                    One or more attribute mappings are missing. These are necessary for
                    authentication to work correctly.
                  </p>
                </div>
              `
            : ''}
          ${hasSamlProvider && hasEnabledSaml && !missingAttributeMappings
            ? html`
                <div class="alert alert-success">
                  <h2 class="h5">SAML single sign-on is configured and enabled!</h2>
                  <p class="mb-0">
                    Users can sign into your institution using your configured SAML provider.
                  </p>
                </div>
              `
            : ''}
          ${hasSamlProvider
            ? html`
                <div class="card mb-4">
                  <div class="card-header bg-primary text-white d-flex align-items-center">
                    Information required by your Identity Provider
                  </div>
                  <div class="card-body">
                    <p>
                      If your Identity Provider supports obtaining Service Provider configuration
                      from a metadata URL, use the following:
                    </p>
                    <small class="text-muted">Metadata URL</small>
                    <div class="form-control mb-3">${metadataUrl}</div>
                    <p>Otherwise, use the following values to configure your Identity Provider:</p>
                    <small class="text-muted">Issuer / Entity ID</small>
                    <div class="form-control mb-3">${issuer}</div>
                    <small class="text-muted">Assertion Consumer Service URL</small>
                    <div class="form-control mb-3">${assertionConsumerServiceUrl}</div>
                    <small class="text-muted">Public Key</small>
                    <pre
                      class="form-control mb-0"
                      style="height: auto;"
                    ><code>${samlProvider.public_key}</code></pre>
                  </div>
                </div>
              `
            : ''}

          <h2 class="h4">Identity Provider configuration</h2>
          <form method="POST" class="mb-3 js-configure-form" ${!hasSamlProvider ? 'hidden' : ''}>
            <div class="form-group">
              <label for="issuer">Issuer / Entity ID</label>
              <input
                type="text"
                class="form-control"
                name="issuer"
                id="issuer"
                value="${samlProvider?.issuer ?? ''}"
                describedBy="issuer-help"
                aria-describedby="issuerHelp"
              />
              <small id="issuerHelp" class="form-text text-muted">
                Typically a unique URL generated by your Identity Provider.
              </small>
            </div>

            <div class="form-group">
              <label for="sso_login_url">SSO Login URL</label>
              <input
                type="text"
                class="form-control"
                name="sso_login_url"
                id="sso_login_url"
                value="${samlProvider?.sso_login_url ?? ''}"
                aria-describedby="ssoLoginUrlHelp"
              />
              <small id="ssoLoginUrlHelp" class="form-text text-muted">
                The SAML endpoint URL generated by your Identity Provider. PrairieLearn only
                supports the HTTP Redirect binding; HTTP POST is not supported.
              </small>
            </div>

            <div class="form-group">
              <label for="certificate">Public Certificate</label>
              <textarea
                class="form-control"
                name="certificate"
                id="certificate"
                rows="20"
                aria-describedby="certificateHelp"
              >
${samlProvider?.certificate ?? '-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----'}</textarea
              >
              <small id="certificateHelp" class="form-text text-muted">
                The public certificate of the Identity Provider. This is used to verify the
                signature of the SAML response. This <strong>must</strong> be a valid X.509
                certificate in PEM format, including the header and footer.
              </small>
            </div>

            <div class="form-group form-check">
              <input
                type="checkbox"
                class="form-check-input"
                id="validate_audience"
                name="validate_audience"
                value="1"
                ${(samlProvider?.validate_audience ?? true) ? 'checked' : ''}
                aria-describedBy="validateAudienceHelp"
              />
              <label class="form-check-label" for="validate_audience">Validate audience</label>
              <small id="validateAudienceHelp" class="form-text text-muted mt-0">
                Whether or not to validate the audience of the SAML response. This should be enabled
                unless the Identity Provider doesn't send a correct value for the audience.
              </small>
            </div>

            <div class="form-group form-check">
              <input
                type="checkbox"
                class="form-check-input"
                id="want_assertions_signed"
                name="want_assertions_signed"
                value="1"
                ${(samlProvider?.want_assertions_signed ?? true) ? 'checked' : ''}
                aria-describedBy="wantAssertionsSignedHelp"
              />
              <label class="form-check-label" for="want_assertions_signed">
                Require signed assertions
              </label>
              <small id="wantAssertionsSignedHelp" class="form-text text-muted mt-0">
                Whether or not to require that assertions are signed. This should be enabled unless
                the Identity Provider doesn't sign assertions.
              </small>
            </div>

            <div class="form-group form-check">
              <input
                type="checkbox"
                class="form-check-input"
                id="want_authn_response_signed"
                name="want_authn_response_signed"
                value="1"
                ${(samlProvider?.want_authn_response_signed ?? true) ? 'checked' : ''}
                aria-describedBy="wantAuthnResponseSignedHelp"
              />
              <label class="form-check-label" for="want_authn_response_signed">
                Require signed response
              </label>
              <small id="wantAuthnResponseSignedHelp" class="form-text text-muted mt-0">
                Whether or not to require that the response is signed. This should be enabled unless
                the Identity Provider doesn't sign responses.
              </small>
            </div>

            <h3 class="h5">Attribute mappings</h3>
            <p>
              You must specify a mapping from your Identity Provider's attributes to PrairieLearn's
              user attributes. This will vary from provider to provider, but they will typically
              have the form
              <code>urn:oid:...</code>.
            </p>

            ${!hasSamlProvider
              ? html`<div class="alert alert-info">
                  If you're not sure which attributes are available, you can leave these blank for
                  now and use the "Test SAML login" link after setting up your Identity Provider.
                </div>`
              : ''}

            <div class="form-group">
              <label for="name_attribute">Name attribute</label>
              <input
                type="text"
                class="form-control"
                name="name_attribute"
                id="name_attribute"
                value="${samlProvider?.name_attribute ?? ''}"
                aria-describedby="nameAttributeHelp"
              />
              <small id="nameAttributeHelp" class="form-text text-muted">
                This attribute should contain the full name of the user, like "Jasmine Wang".
              </small>
            </div>

            <div class="form-group">
              <label for="name_attribute">UID attribute</label>
              <input
                type="text"
                class="form-control"
                name="uid_attribute"
                id="uid_attribute"
                value="${samlProvider?.uid_attribute ?? ''}"
                aria-describedby="uidAttributeHelp"
              />
              <small id="uidAttributeHelp" class="form-text text-muted">
                The UID is a user-facing identifier for the user. This should generally be an
                email-like identifier, like "jwang@example.com". However, it doesn't have to be an
                email address; PrairieLearn will never try to route email to it. This attribute may
                change, for instance if a student changes their name with their university.
              </small>
            </div>

            <div class="form-group">
              <label for="name_attribute">UIN attribute</label>
              <input
                type="text"
                class="form-control"
                name="uin_attribute"
                id="uin_attribute"
                value="${samlProvider?.uin_attribute ?? ''}"
                aria-describedby="uinAttributeHelp"
              />
              <small id="uinAttributeHelp" class="form-text text-muted">
                The UIN is used as an internal, immutable identifier for the user. It
                <strong>MUST</strong> never change for a given individual, even if they change their
                name or email.
              </small>
            </div>

            <div class="form-group">
              <label for="email_attribute">Email attribute</label>
              <input
                type="text"
                class="form-control"
                name="email_attribute"
                id="email_attribute"
                value="${samlProvider?.email_attribute ?? ''}"
                aria-describedby="emailAttributeHelp"
              />
              <small id="emailAttributeHelp" class="form-text text-muted">
                The email attribute should contain the email address of the user, like
                "jwang123@example.com". This may be the same as the UID attribute for some
                institutions. You should confirm that the values received in this attribute are
                routable email addresses.
              </small>
            </div>

            <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
            <button type="submit" class="btn btn-primary" name="__action" value="save">Save</button>
            <a class="btn btn-secondary" href="">Cancel</a>
          </form>
          <div class="js-configure-prompt" ${hasSamlProvider ? 'hidden' : ''}>
            <p>A SAML identity provider has not been configured.</p>
            <button type="button" class="btn btn-primary js-configure-prompt-button">
              Configure SAML identity provider
            </button>
          </div>
          ${hasSamlProvider
            ? html`
                <p>
                  <a href="${testSamlUrl}" target="_blank">Test SAML login</a>: Shows all attributes
                  from the SAML IdP without establishing a session.
                </p>

                <p>
                  <a href="${testSamlStrictUrl}" target="_blank">Test SAML login (strict mode)</a>:
                  Forces "validate audience", "require signed assertions", and "require signed
                  response" to be enabled.
                </p>

                <p>
                  <a href="${metadataUrl}" target="_blank">View SAML metadata</a>: Metadata can be
                  provided to institutions to help them configure their SAML IdP.
                </p>

                <p>
                  <button
                    class="btn btn-danger"
                    type="button"
                    data-toggle="modal"
                    data-target="#deleteModal"
                  >
                    Delete SAML configuration
                  </button>
                </p>

                <h2 class="h4">Decode SAML assertion</h2>

                <form method="POST">
                  <div class="form-group">
                    <label for="encodedAssertion">Encoded assertion</label>
                    <textarea
                      class="form-control"
                      id="encodedAssertion"
                      rows="10"
                      name="encoded_assertion"
                      aria-describedby="encodedAssertionHelp"
                    ></textarea>
                    <small class="form-text text-muted">
                      This should be raw base64-encoded data from the
                      <code>SAMLResponse</code> parameter in the POST request from the IdP.
                    </small>
                  </div>

                  <div class="form-group form-check">
                    <input
                      type="checkbox"
                      class="form-check-input"
                      id="strictMode"
                      name="strict_mode"
                      value="1"
                      aria-describedBy="strictModeHelp"
                    />
                    <label class="form-check-label" for="strictMode">Strict mode</label>
                    <small id="strictModeHelp" class="form-text text-muted mt-0">
                      Forces "validate audience", "require signed assertions", and "require signed
                      response" to be enabled.
                    </small>
                  </div>

                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button
                    class="btn btn-primary"
                    type="button"
                    name="__action"
                    value="decode_assertion"
                    hx-post="${resLocals.urlPrefix}/saml"
                    hx-target="#decodedAssertion"
                    hx-swap="innerHTML show:top"
                  >
                    Decode
                  </button>
                  <div id="decodedAssertion"></div>
                </form>
              `
            : ''}
        </main>

        <script>
          (function () {
            // Show the configuration form when the button is clicked.
            document
              .querySelector('.js-configure-prompt-button')
              .addEventListener('click', function () {
                document.querySelector('.js-configure-prompt').hidden = true;
                document.querySelector('.js-configure-form').hidden = false;
              });
          })();
        </script>
      </body>
    </html>
  `.toString();
}

function DeleteSamlConfigurationModal({ csrfToken }: { csrfToken: string }) {
  return Modal({
    id: 'deleteModal',
    title: 'Confirm deletion',
    body: html`
      <p>
        Are you sure you want to delete the SAML configuration? Users in your institution, including
        yourself, may be unable to log in to PrairieLearn.
      </p>
    `,
    footer: html`
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
      <button class="btn btn-danger" type="submit" name="__action" value="delete">
        Delete SAML configuration
      </button>
    `,
  });
}

export function DecodedAssertion({ xml, profile }: { xml: string; profile: string }) {
  return html`
    <h3 class="h5 mt-3">Decoded XML</h2>
    <pre class="bg-dark text-white rounded p-3 mt-3 mb-0">${xml}</pre>

    <h3 class="h5 mt-3">Profile</h2>
    <pre class="bg-dark text-white rounded p-3 mt-3 mb-0">${profile}</pre>
  `.toString();
}
