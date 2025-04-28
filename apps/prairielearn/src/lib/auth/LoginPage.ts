import { type HtmlValue, html } from '@prairielearn/html';
import { AuthProvider } from './providers/AuthProvider.js';
import { config } from '../config.js';
import { HeadContents } from '../../components/HeadContents.html.js';

export class LoginPage {
    private providers: AuthProvider[] = [];

    constructor(
        private readonly service: string | null,
        private readonly resLocals: Record<string, any>
    ) {}

    addProvider(provider: AuthProvider) {
        this.providers.push(provider);
    }

    getProviderCount(): number {
        return this.providers.length;
    }

    getProviderDetails(): Array<{ name: string; isDefault: boolean; isSupported: boolean }> {
        return this.providers.map(provider => ({
            name: provider.getName(),
            isDefault: provider.isDefault,
            isSupported: provider.isSupported()
        }));
    }

    render(): HtmlValue {
        const defaultProvider = this.providers.find(p => p.isDefault);
        const otherProviders = this.providers.filter(p => !p.isDefault);

        return html`
            <!doctype html>
            <html lang="en">
                <head>
                    ${HeadContents({ resLocals: this.resLocals })}
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
                    </style>
                </head>
                <body class="d-flex flex-column">
                    <main class="login-container-wrapper">
                        <div class="login-container">
                            <div>
                                <h1 class="text-center">
                                    <a href="https://www.prairielearn.com/" target="_blank" class="text-body">
                                        PrairieLearn
                                    </a>
                                </h1>
                                <h2 class="text-center subheader mb-5">
                                    Sign in ${this.service ? `to continue to ${this.service}` : ''}
                                </h2>
                                ${config.devMode ? this.renderDevModeSection() : ''}
                                <div class="login-methods mt-4">
                                    ${defaultProvider ? this.renderDefaultProvider(defaultProvider) : ''}
                                    ${otherProviders.length > 0 ? this.renderOtherProviders(otherProviders) : ''}
                                </div>
                            </div>
                        </div>
                    </main>
                    ${this.renderFooter()}
                </body>
            </html>
        `;
    }

    private renderDevModeSection(): HtmlValue {
        return html`
            <div class="alert alert-info">
                <h4>Development Mode</h4>
                <p>You are running in development mode. Use the form below to log in.</p>
                <form method="POST">
                    <div class="mb-3">
                        <label class="form-label" for="dev_uid">UID</label>
                        <input type="text" class="form-control" id="dev_uid" name="uid" required />
                    </div>
                    <div class="mb-3">
                        <label class="form-label" for="dev_name">Name</label>
                        <input type="text" class="form-control" id="dev_name" name="name" required />
                    </div>
                    <input type="hidden" name="__csrf_token" value="${this.resLocals.__csrf_token}" />
                    <button type="submit" class="btn btn-primary" name="__action" value="dev_login">
                        Dev Mode Login
                    </button>
                </form>
            </div>
        `;
    }

    private renderDefaultProvider(provider: AuthProvider): HtmlValue {
        return html`
            <small class="text-muted text-center d-block mb-2">Preferred provider</small>
            ${provider.renderButton()}
        `;
    }

    private renderOtherProviders(providers: AuthProvider[]): HtmlValue {
        return html`
            <small class="text-muted text-center d-block mt-4 mb-2">Other providers</small>
            <div class="login-methods">
                ${providers.map(p => p.renderButton())}
            </div>
        `;
    }

    private renderFooter(): HtmlValue {
        return config.homepageFooterText && config.homepageFooterTextHref
            ? html`
                  <footer class="footer small fw-light text-light text-center">
                      <div class="bg-secondary p-1">
                          <a class="text-light" href="${config.homepageFooterTextHref}">
                              ${config.homepageFooterText}
                          </a>
                      </div>
                  </footer>
              `
            : '';
    }
} 