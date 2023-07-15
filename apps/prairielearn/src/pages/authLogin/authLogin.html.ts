import { html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { config } from '../../lib/config';
import { assetPath } from '../../lib/assets';
import { isEnterprise } from '../../lib/license';

export interface InstitutionAuthnProvider {
  name: string;
  url: string;
}

interface AuthLoginProps {
  institutionAuthnProviders: InstitutionAuthnProvider[] | null;
  service: string | null;
  resLocals: Record<string, any>;
}

export function AuthLogin({ institutionAuthnProviders, service, resLocals }: AuthLoginProps) {
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
              <h2 class="text-center subheader">
                Sign in ${service ? `to continue to ${service}` : ''}
              </h2>
              <div class="login-methods mt-5">
                ${resLocals.devMode
                  ? html`
                      <a class="btn btn-success w-100" href="/pl/dev_login" role="button">
                        <span class="font-weight-bold">DevMode by-pass</span>
                      </a>
                    `
                  : null}
                ${config.hasShib && !config.hideShibLogin
                  ? html`
                      <a
                        class="btn btn-shib w-100 position-relative"
                        href="/pl/shibcallback"
                        role="button"
                      >
                        ${config.shibLinkLogo != null
                          ? html` <img src="${config.shibLinkLogo}" class="social-icon" /> `
                          : html` <span class="social-icon"></span> `}
                        <span class="font-weight-bold">${config.shibLinkText}</span>
                      </a>
                    `
                  : null}
                ${config.hasOauth
                  ? html`
                      <a
                        class="btn btn-primary w-100 position-relative"
                        href="/pl/oauth2login"
                        role="button"
                      >
                        <img src="${assetPath('images/google_logo.svg')}" class="social-icon" />
                        <span class="font-weight-bold">Sign in with Google</span>
                      </a>
                    `
                  : null}
                ${config.hasAzure && isEnterprise()
                  ? html`
                      <a
                        class="btn btn-dark w-100 position-relative"
                        href="/pl/azure_login"
                        role="button"
                      >
                        <img src="${assetPath('images/ms_logo.svg')}" class="social-icon" />
                        <span class="font-weight-bold">Sign in with Microsoft</span>
                      </a>
                    `
                  : null}
              </div>
              ${institutionAuthnProviders?.length
                ? html`
                    <div class="institution-header text-muted my-3">Institution sign-on</div>
                    <div class="login-methods">
                      ${institutionAuthnProviders.map(
                        (provider) => html`
                          <a href="${provider.url}" class="btn btn-outline-dark btn-block">
                            ${provider.name}
                          </a>
                        `,
                      )}
                    </div>
                  `
                : null}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
