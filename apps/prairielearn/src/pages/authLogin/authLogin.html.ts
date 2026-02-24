import clsx from 'clsx';

import { type HtmlValue, html } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { HeadContents } from '../../components/HeadContents.js';
import { assetPath } from '../../lib/assets.js';
import { config } from '../../lib/config.js';
import type { AuthnProvider } from '../../lib/db-types.js';
import { isEnterprise } from '../../lib/license.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export interface InstitutionAuthnProvider {
  name: string;
  url: string;
}

interface InstitutionSupportedProvider {
  name: AuthnProvider['name'];
  is_default: boolean;
}

function LoginPageContainer({
  children,
  service,
  resLocals,
}: {
  children: HtmlValue;
  service: string | null;
  resLocals: UntypedResLocals;
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
      </body>
    </html>
  `;
}

function ShibLoginButton() {
  return html`
    <a class="btn btn-shib d-block position-relative" href="/pl/shibcallback">
      <img src="${config.shibLinkLogo}" class="social-icon" alt="" />
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

function SamlLoginButton({ institutionId }: { institutionId: string }) {
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
  resLocals: UntypedResLocals;
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
      <div class="d-flex flex-column gap-2 mt-4">
        ${config.hasShib && !config.hideShibLogin ? ShibLoginButton() : ''}
        ${config.hasOauth ? GoogleLoginButton() : ''}
        ${config.hasAzure && isEnterprise() ? MicrosoftLoginButton() : ''}
      </div>
      ${institutionAuthnProviders?.length
        ? html`
            <div class="institution-header text-muted my-3">Institution sign-on</div>
            <div class="d-flex flex-column gap-2">
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

function isLtiProvider(provider: InstitutionSupportedProvider) {
  return provider.name === 'LTI' || provider.name === 'LTI 1.3';
}

export function AuthLoginInstitution({
  showUnsupportedMessage,
  supportedProviders,
  institutionId,
  service,
  resLocals,
}: {
  showUnsupportedMessage: boolean;
  supportedProviders: InstitutionSupportedProvider[];
  institutionId: string;
  service: string | null;
  resLocals: UntypedResLocals;
}) {
  // We need to filter `supportedProviders` to reflect which ones are actually
  // enabled in the application configuration.
  const loginOptions = supportedProviders.filter((p) => {
    // LTI options are always excluded from this list. An LTI session must always
    // start from the LTI platform, not from PrairieLearn.
    if (isLtiProvider(p)) return false;

    // Some options require specific configuration to be enabled.
    if (p.name === 'Google') return config.hasOauth;
    if (p.name === 'Azure') return config.hasAzure && isEnterprise();
    if (p.name === 'Shibboleth') return config.hasShib && !config.hideShibLogin;

    // Assume other providers are always enabled.
    return true;
  });

  // LTI providers were filtered out above; we need to check the original list.
  const supportsAnyLti = supportedProviders.some((p) => isLtiProvider(p));
  const supportsNonLti = supportedProviders.some((p) => !isLtiProvider(p));

  const supportsSaml = loginOptions.some((p) => p.name === 'SAML');
  const supportsShib = loginOptions.some((p) => p.name === 'Shibboleth');
  const supportsGoogle = loginOptions.some((p) => p.name === 'Google');
  const supportsAzure = loginOptions.some((p) => p.name === 'Azure');

  const defaultProvider = loginOptions.find((p) => p.is_default === true);
  const hasNonDefaultProviders = loginOptions.find((p) => p.is_default === false);

  // If a default provider is set, we'll always show it first. These variables
  // determine whether to separately show other non-default providers.
  const showSaml = supportsSaml && defaultProvider?.name !== 'SAML';
  const showShib = supportsShib && defaultProvider?.name !== 'Shibboleth';
  const showGoogle = supportsGoogle && defaultProvider?.name !== 'Google';
  const showAzure = supportsAzure && defaultProvider?.name !== 'Azure';

  const defaultProviderButton = run(() => {
    switch (defaultProvider?.name) {
      case 'SAML':
        return SamlLoginButton({ institutionId });
      case 'Shibboleth':
        return ShibLoginButton();
      case 'Google':
        return GoogleLoginButton();
      case 'Azure':
        return MicrosoftLoginButton();
    }
  });

  return LoginPageContainer({
    service,
    resLocals,
    children: html`
      ${run(() => {
        if (showUnsupportedMessage) {
          return html`
            <div
              class="${clsx('alert alert-danger text-center', {
                'mb-0': loginOptions.length === 0,
              })}"
              role="alert"
            >
              The authentication method you tried to use is not supported by your institution.
              ${run(() => {
                if (loginOptions.length > 0) {
                  return 'Try again with a supported method.';
                }

                if (supportsAnyLti) {
                  return "You must start a session from your course's Learning Management System (LMS).";
                }

                // This institution somehow has no login options.
                return 'Contact your institution for more information.';
              })}
            </div>
          `;
        }

        if (!supportsNonLti && supportsAnyLti) {
          return html`
            <div class="alert alert-danger text-center mb-0" role="alert">
              You must start a session from your course's Learning Management System (LMS).
            </div>
          `;
        }

        if (loginOptions.length === 0) {
          return html`
            <div class="alert alert-danger text-center mb-0" role="alert">
              No authentication methods found. Contact your institution for more information.
            </div>
          `;
        }
      })}
      ${defaultProviderButton
        ? html`
            ${hasNonDefaultProviders
              ? html`<small class="text-muted text-center d-block mb-2">Preferred method</small>`
              : ''}
            ${defaultProviderButton}
            ${hasNonDefaultProviders
              ? html`
                  <small class="text-muted text-center d-block mt-4 mb-2">Other methods</small>
                `
              : ''}
          `
        : ''}
      <div class="d-flex flex-column gap-2">
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
