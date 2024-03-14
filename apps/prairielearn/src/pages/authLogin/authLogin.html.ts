import { html, type HtmlValue } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { config } from '../../lib/config';
import { assetPath } from '../../lib/assets';
import { isEnterprise } from '../../lib/license';

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
    <html lang="en" class="bg-dark">
      <head>
        ${renderEjs(__filename, "<%- include('../partials/head'); %>", resLocals)}
        <style>
          html,
          body {
            height: 100%;
            background-color: #e9ecef;
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
      <body class="d-flex bg-dark">
        <main class="login-container-wrapper">
          <div class="login-container">
            <div>
              <h1 class="text-center">PrairieLearn</h1>
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
    <a class="btn btn-shib d-block position-relative" href="/pl/shibcallback" role="button">
      ${config.shibLinkLogo != null
        ? html`<img src="${config.shibLinkLogo}" class="social-icon" />`
        : html`<span class="social-icon"></span>`}
      <span class="font-weight-bold">${config.shibLinkText}</span>
    </a>
  `;
}

function GoogleLoginButton() {
  return html`
    <a class="btn btn-primary d-block position-relative" href="/pl/oauth2login" role="button">
      <img src="${assetPath('/images/google_logo.svg')}" class="social-icon" />
      <span class="font-weight-bold">Sign in with Google</span>
    </a>
  `;
}

function MicrosoftLoginButton() {
  return html`
    <a class="btn btn-dark d-block position-relative" href="/pl/azure_login" role="button">
      <img src="${assetPath('/images/ms_logo.svg')}" class="social-icon" />
      <span class="font-weight-bold">Sign in with Microsoft</span>
    </a>
  `;
}

function SamlLoginButton({ institutionId }) {
  return html`
    <a class="btn btn-primary d-block" href="${`/pl/auth/institution/${institutionId}/saml/login`}">
      <span class="font-weight-bold">Sign in with institution single sign-on</span>
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
      ${resLocals.devMode
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
                  <a href="${provider.url}" class="btn btn-outline-dark btn-block">
                    <span class="font-weight-bold">${provider.name}</span>
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
  supportedProviders,
  institutionId,
  service,
  resLocals,
}: {
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
      <div class="alert alert-danger text-center my-4" role="alert">
        The authentication provider you tried to use is not supported by your institution.
        ${supportsNonLti ? 'Please use a supported provider.' : ''}
        ${!supportsNonLti && supportsLti
          ? "You must start a session from your course's Learning Management System (LMS)."
          : ''}
        ${supportedProviders.length === 0 ? 'Contact your institution for more information.' : ''}
      </div>
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
    <a class="btn btn-success w-100" href="/pl/dev_login" role="button">
      <span class="font-weight-bold">Dev Mode Bypass</span>
    </a>
    <small class="text-muted">You will be authenticated as <tt>${config.authUid}</tt>.</small>
  `;
}

function DevModeLogin({ csrfToken }: { csrfToken: string }) {
  return html`
    <form method="POST">
      <div class="form-group">
        <label for="dev_uid">UID</label>
        <input class="form-control" id="dev_uid" name="uid" required />
      </div>
      <div class="form-group">
        <label for="dev_name">Name</label>
        <input class="form-control" id="dev_name" name="name" required />
      </div>
      <div class="form-group">
        <label for="dev_uin">UIN</label>
        <input class="form-control" id="dev_uin" name="uin" aria-describedby="dev_uin_help" />
        <small id="dev_uin_help" class="form-text text-muted">
          Optional; will be set to <tt>null</tt> if not specified.
        </small>
      </div>
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="submit" class="btn btn-primary btn-block" name="__action" value="dev_login">
        <span class="font-weight-bold">Dev Mode Login</span>
      </button>
    </form>
  `;
}
