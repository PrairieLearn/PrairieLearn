import { type HtmlValue, html } from '@prairielearn/html';
import { AuthProvider } from './AuthProvider.js';

export class AzureAuthProvider extends AuthProvider {
    constructor(isDefault: boolean = false) {
        super('Azure', isDefault);
    }

    renderButton(): HtmlValue {
        return html`
            <a class="btn btn-dark d-block position-relative" href="${this.getLoginUrl()}">
                ${this.renderSocialIcon('/images/ms_logo.svg')}
                <span class="fw-bold">Sign in with Microsoft</span>
            </a>
        `;
    }

    getLoginUrl(): string {
        return '/pl/azure_login';
    }

    isSupported(): boolean {
        return config.hasAzure;
    }
} 