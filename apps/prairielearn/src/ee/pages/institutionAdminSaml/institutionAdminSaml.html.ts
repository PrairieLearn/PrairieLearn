import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';
import { type AuthnProvider, type Institution, type SamlProvider } from '../../../lib/db-types';

export const InstitutionAdminSaml = ({
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
}) => {
  const hasSamlProvider = !!samlProvider;
  const hasEnabledSaml = institutionAuthenticationProviders.some((p) => p.name === 'SAML');

  const missingAttributeMappings =
    !samlProvider?.uid_attribute || !samlProvider?.uin_attribute || !samlProvider?.name_attribute;

  const issuer = `https://${host}/saml/institution/${institution.id}`;
  const metadataUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/metadata`;
  const assertionConsumerServiceUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/callback`;
  const testSamlUrl = `https://${host}/pl/auth/institution/${institution.id}/saml/login?RelayState=test`;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/head')%>", {
          ...resLocals,
          navPage: 'institution_admin',
          pageTitle: 'SAML',
        })}
      </head>
      <body>
        ${renderEjs(__filename, "<%- include('../../../pages/partials/navbar') %>", {
          ...resLocals,
          institution,
          navbarType: 'institution',
          navPage: 'institution_admin',
          navSubPage: 'saml',
        })}
        <main class="container mb-4">
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
              <textarea class="form-control" name="certificate" id="certificate" rows="20">
${samlProvider?.certificate ?? ''}</textarea
              >
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
                  <a href="${testSamlUrl}" target="_blank"> Test SAML login </a>
                </p>

                <p>
                  <a href="${metadataUrl}" target="_blank"> View SAML metadata </a>
                </p>

                <button
                  class="btn btn-danger"
                  type="button"
                  data-toggle="modal"
                  data-target="#deleteModal"
                >
                  Delete SAML configuration
                </button>
              `
            : ''}
        </main>

        <div class="modal" tabindex="-1" id="deleteModal">
          <div class="modal-dialog">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title">Confirm deletion</h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div class="modal-body">
                <p>
                  Are you sure you want to delete the SAML configuration? Users in your institution,
                  including yourself, may be unable to log in to PrairieLearn.
                </p>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-dismiss="modal">Close</button>
                <form method="POST">
                  <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                  <button class="btn btn-danger" type="submit" name="__action" value="delete">
                    Delete SAML configuration
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>

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
};
