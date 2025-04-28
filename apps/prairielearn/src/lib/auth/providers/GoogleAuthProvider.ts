import { type HtmlValue, html } from '@prairielearn/html';
import { AuthProvider } from './AuthProvider.js';

export class GoogleAuthProvider extends AuthProvider {
    constructor(isDefault: boolean = false) {
        super('Google', isDefault);
    }

    renderButton(): HtmlValue {
        return html`
            <a class="btn btn-primary d-block position-relative" href="${this.getLoginUrl()}">
                ${this.renderSocialIcon('/images/google_logo.svg')}
                <span class="fw-bold">Sign in with Google</span>
            </a>
        `;
    }

    getLoginUrl(): string {
        return '/pl/oauth2login';
    }

    isSupported(): boolean {
        return config.hasOauth;
    }
} 