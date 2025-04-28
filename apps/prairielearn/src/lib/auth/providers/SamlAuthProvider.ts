import { type HtmlValue, html } from '@prairielearn/html';
import { AuthProvider } from './AuthProvider.js';

export class SamlAuthProvider extends AuthProvider {
    constructor(
        private readonly institutionId: string,
        isDefault: boolean = false
    ) {
        super('SAML', isDefault);
    }

    renderButton(): HtmlValue {
        return html`
            <a class="btn btn-primary d-block" href="${this.getLoginUrl()}">
                <span class="fw-bold">Sign in with institution single sign-on</span>
            </a>
        `;
    }

    getLoginUrl(): string {
        return `/pl/auth/institution/${this.institutionId}/saml/login`;
    }
} 