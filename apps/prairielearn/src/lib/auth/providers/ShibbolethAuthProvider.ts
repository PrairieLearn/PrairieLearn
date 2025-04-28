import { type HtmlValue, html } from '@prairielearn/html';
import { AuthProvider } from './AuthProvider.js';

export class ShibbolethAuthProvider extends AuthProvider {
    constructor(isDefault: boolean = false) {
        super('Shibboleth', isDefault);
    }

    renderButton(): HtmlValue {
        return html`
            <a class="btn btn-shib d-block position-relative" href="${this.getLoginUrl()}">
                ${config.shibLinkLogo != null
                    ? html`<img src="${config.shibLinkLogo}" class="social-icon" />`
                    : html`<span class="social-icon"></span>`}
                <span class="fw-bold">${config.shibLinkText}</span>
            </a>
        `;
    }

    getLoginUrl(): string {
        return '/pl/shibcallback';
    }

    isSupported(): boolean {
        return config.hasShib && !config.hideShibLogin;
    }
} 