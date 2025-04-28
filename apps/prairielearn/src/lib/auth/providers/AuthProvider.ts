import { type HtmlValue, html } from '@prairielearn/html';
import { assetPath } from '../../assets.js';
import { config } from '../../config.js';

export abstract class AuthProvider {
    constructor(
        protected readonly name: string,
        public readonly isDefault: boolean = false
    ) {}

    abstract renderButton(): HtmlValue;
    abstract getLoginUrl(): string;
    
    isSupported(): boolean {
        return true;
    }

    shouldShow(): boolean {
        return this.isSupported();
    }

    getName(): string {
        return this.name;
    }

    protected renderSocialIcon(imagePath: string): HtmlValue {
        return html`
            <img src="${assetPath(imagePath)}" class="social-icon" />
        `;
    }
} 