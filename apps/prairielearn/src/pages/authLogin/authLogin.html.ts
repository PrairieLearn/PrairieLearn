import { type HtmlValue, html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../components/HeadContents.js';
import { assetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import { isEnterprise } from '../../lib/license.js';

export interface InstitutionAuthnProvider {
  name: string;
  url: string;
}

export interface InstitutionSupportedProviders {
  name: string;
  is_default: boolean;
}

function LoginPageContainer({
  children,
  service,
  resLocals,
}: {
  children: HtmlValue;
  service: string | null;
  resLocals: Record<string, any>;
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })}
        <style>
          html,
          body {
            min-height: 100vh;
          }

          .login-container-wrapper {
            width: 100%;
            height: 100%;
          }

          .login-container {
            background-color: white;
            padding: 20px;
            height: 100%;
          }

          .login-methods > :not(:last-child) {
            margin-bottom: 0.5rem;
          }

          @media (min-width: 576px) {
            html,
            body {
              background-color: var(--bs-dark);
            }

            .login-container-wrapper {
              max-width: 500px;
              margin: auto;
              height: auto;
            }

            .login-container {
              border-radius: 5px;
              box-shadow:
                0 19px 38px rgba(0, 0, 0, 0.3),
                0 15px 12px rgba(0, 0, 0, 0.22);
              height: auto;
              margin: 20px;
            }
          }

          .subheader {
            font-weight: 300;
            font-size: 1.2rem;
          }

          .btn .social-icon {
            position: absolute;
            left: 7px;
            height: 24px;
            top: 0;
            bottom: 0;
            margin: auto;
          }

          .btn-shib {
            background-color: ${config.shibLinkColors.normal.background};
            border-color: ${config.shibLinkColors.normal.border};
            color: ${config.shibLinkColors.normal.text};
          }

          .btn-shib:hover {
            background-color: ${config.shibLinkColors.hover.background};
            border-color: ${config.shibLinkColors.hover.border};
            color: ${config.shibLinkColors.hover.text};
          }

          .btn-shib:focus {
            box-shadow: 0 0 0 0.2rem ${config.shibLinkColors.focus.shadow};
          }

          .btn-shib:active {
            background-color: ${config.shibLinkColors.active.background};
            border-color: ${config.shibLinkColors.active.border};
            color: ${config.shibLinkColors.active.text};
          }

          .institution-header {
            overflow: hidden;
            text-align: center;
          }

          .institution-header:before,
          .institution-header:after {
            background-color: #000;
            content: '';
            display: inline-block;
            height: 1px;
            position: relative;
            vertical-align: middle;
            width: 50%;
          }

          .institution-header:before {
            right: 0.5em;
            margin-left: -50%;
          }

          .institution-header:after {
            left: 0.5em;
            margin-right: -50%;
          }
        </style>
      </head>
      <body class="d-flex flex-column">
        <main class="login-container-wrapper">
          <div class="login-container">
            <div>
              <h1 class="text-center">
                <a
                  href="https://www.prairielearn.com/"
                  target="_blank"
                  rel="noreferrer"
                  class="text-body"
                >
                  PrairieLearn
                </a>
              </h1>
              <h2 class="text-center subheader mb-5">
                Sign in ${service ? `to continue to ${service}` : ''}
              </h2>
              ${children}
            </div>
          </div>
        </main>
        ${config.homepageFooterText && config.homepageFooterTextHref
          ? html`
              <footer class="footer small fw-light text-light text-center">
                <div class="bg-secondary p-1">
                  <a class="text-light" href="${config.homepageFooterTextHref}">
                    ${config.homepageFooterText}
                  </a>
                </div>
              </footer>
            `
          : ''}
      </body>
    </html>
  `;
}

function ShibLoginButton() {
  return html`
    <a class="btn btn-shib d-block position-relative" href="/pl/shibcallback">
      ${config.shibLinkLogo != null
        ? html`<img src="${config.shibLinkLogo}" class="social-icon" alt="" />`
        : html`<span class="social-icon"></span>`}
      <span class="fw-bold">${config.shibLinkText}</span>
    </a>
  `;
}

function GoogleLoginButton() {
  return html`
    <a class="btn btn-primary d-block position-relative" href="/pl/oauth2login">
      <img src="${assetPath('/images/google_logo.svg')}" class="social-icon" alt="" />
      <span class="fw-bold">Sign in with Google</span>
    </a>
  `;
}

function MicrosoftLoginButton() {
  return html`
    <a class="btn btn-dark d-block position-relative" href="/pl/azure_login">
      <img src="${assetPath('/images/ms_logo.svg')}" class="social-icon" alt="" />
      <span class="fw-bold">Sign in with Microsoft</span>
    </a>
  `;
}

function SamlLoginButton({ institutionId }) {
  return html`
    <a class="btn btn-primary d-block" href="${`/pl/auth/institution/${institutionId}/saml/login`}">
      <span class="fw-bold">Sign in with institution single sign-on</span>
    </a>
  `;
}

export function AuthLogin({
  institutionAuthnProviders,
  service,
  resLocals,
}: {
  institutionAuthnProviders: InstitutionAuthnProvider[] | null;
  service: string | null;
  resLocals: Record<string, any>;
}) {
  return LoginPageContainer({
    service,
    resLocals,
    children: html`
      ${config.devMode
        ? html`
            ${DevModeBypass()}
            <hr />
            ${DevModeLogin({ csrfToken: resLocals.__csrf_token })}
            <hr />
          `
        : ''}
      <div class="login-methods mt-4">
        ${config.hasShib && !config.hideShibLogin ? ShibLoginButton() : ''}
        ${config.hasOauth ? GoogleLoginButton() : ''}
        ${config.hasAzure && isEnterprise() ? MicrosoftLoginButton() : ''}
      </div>
      ${institutionAuthnProviders?.length
        ? html`
            <div class="institution-header text-muted my-3">Institution sign-on</div>
            <div class="login-methods">
              ${institutionAuthnProviders.map(
                (provider) => html`
                  <a href="${provider.url}" class="btn btn-outline-dark d-block w-100">
                    <span class="fw-bold">${provider.name}</span>
                  </a>
                `,
              )}
            </div>
          `
        : ''}
    `,
  }).toString();
}

export function AuthLoginUnsupportedProvider({
  showUnsupportedMessage,
  supportedProviders,
  institutionId,
  service,
  resLocals,
}: {
  showUnsupportedMessage: boolean;
  supportedProviders: InstitutionSupportedProviders[];
  institutionId: string;
  service: string | null;
  resLocals: Record<string, any>;
}) {
  const supportsLti = supportedProviders.some((p) => p.name === 'LTI');
  const supportsNonLti = supportedProviders.some((p) => p.name !== 'LTI');

  const supportsSaml = supportedProviders.some((p) => p.name === 'SAML');
  const supportsShib = supportedProviders.some((p) => p.name === 'Shibboleth');
  const supportsGoogle = supportedProviders.some((p) => p.name === 'Google');
  const supportsAzure = supportedProviders.some((p) => p.name === 'Azure');

  const defaultProvider = supportedProviders.find((p) => p.is_default === true);
  const hasNonDefaultProviders = supportedProviders.find(
    (p) => p.name !== 'LTI' && p.is_default === false,
  );

  const showSaml = supportsSaml && defaultProvider?.name !== 'SAML';
  const showShib =
    config.hasShib &&
    !config.hideShibLogin &&
    supportsShib &&
    defaultProvider?.name !== 'Shibboleth';
  const showGoogle = config.hasOauth && supportsGoogle && defaultProvider?.name !== 'Google';
  const showAzure = config.hasAzure && supportsAzure && defaultProvider?.name !== 'Azure';

  let defaultProviderButton: HtmlValue = null;
  switch (defaultProvider?.name) {
    case 'SAML':
      defaultProviderButton = SamlLoginButton({ institutionId });
      break;
    case 'Shibboleth':
      defaultProviderButton = ShibLoginButton();
      break;
    case 'Google':
      defaultProviderButton = GoogleLoginButton();
      break;
    case 'Azure':
      defaultProviderButton = MicrosoftLoginButton();
  }

  return LoginPageContainer({
    service,
    resLocals,
    children: html`
      ${run(() => {
        if (showUnsupportedMessage) {
          return html`
            <div class="alert alert-danger text-center my-4" role="alert">
              The authentication provider you tried to use is not supported by your institution.
              ${supportsNonLti ? 'Please use a supported provider.' : ''}
              ${!supportsNonLti && supportsLti
                ? "You must start a session from your course's Learning Management System (LMS)."
                : ''}
              ${supportedProviders.length === 0
                ? 'Contact your institution for more information.'
                : ''}
            </div>
          `;
        }

        if (supportedProviders.length === 0) {
          return html`
            <div class="alert alert-danger text-center my-4" role="alert">
              No authentication providers found. Contact your institution for more information.
            </div>
          `;
        }

        if (!supportsNonLti && supportsLti) {
          return html`
            <div class="alert alert-danger text-center my-4" role="alert">
              You must start a session from your course's Learning Management System (LMS).
            </div>
          `;
        }
      })}
      ${defaultProviderButton
        ? html`
            <small class="text-muted text-center d-block mb-2">Preferred provider</small>
            ${defaultProviderButton}
            ${hasNonDefaultProviders
              ? html`
                  <small class="text-muted text-center d-block mt-4 mb-2">Other providers</small>
                `
              : ''}
          `
        : ''}
      <div class="login-methods">
        ${[
          showSaml ? SamlLoginButton({ institutionId }) : '',
          showShib ? ShibLoginButton() : '',
          showGoogle ? GoogleLoginButton() : '',
          showAzure ? MicrosoftLoginButton() : '',
        ]}
      </div>
    `,
  }).toString();
}

function DevModeBypass() {
  return html`
    <a class="btn btn-success w-100" href="/pl/dev_login">
      <span class="fw-bold">Dev Mode Bypass</span>
    </a>
    <small class="text-muted">You will be authenticated as <code>${config.authUid}</code>.</small>
  `;
}

function DevModeLogin({ csrfToken }: { csrfToken: string }) {
  return html`
    <form method="POST">
      <div class="mb-3">
        <label class="form-label" for="dev_uid">UID</label>
        <input type="email" class="form-control" id="dev_uid" name="uid" required />
      </div>
      <div class="mb-3">
        <label class="form-label" for="dev_name">Name</label>
        <input type="text" class="form-control" id="dev_name" name="name" required />
      </div>
      <div class="mb-3">
        <label class="form-label" for="dev_uin">UIN</label>
        <input
          type="text"
          class="form-control"
          id="dev_uin"
          name="uin"
          aria-describedby="dev_uin_help"
        />
        <small id="dev_uin_help" class="form-text text-muted">
          Optional; will be set to <code>null</code> if not specified.
        </small>
      </div>
      <div class="mb-3">
        <label class="form-label" for="dev_email">Email</label>
        <input
          type="email"
          class="form-control"
          id="dev_email"
          name="email"
          aria-describedby="dev_email_help"
        />
        <small id="dev_email_help" class="form-text text-muted">
          Optional; will be set to <code>null</code> if not specified.
        </small>
      </div>
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" class="btn btn-primary d-block w-100" name="__action" value="dev_login">
        <span class="fw-bold">Dev Mode Login</span>
      </button>
    </form>
  `;
}
