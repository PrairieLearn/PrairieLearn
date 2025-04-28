import { GoogleAuthProvider } from './GoogleAuthProvider.js';
import { ShibbolethAuthProvider } from './ShibbolethAuthProvider.js';
import { SamlAuthProvider } from './SamlAuthProvider.js';
import { AzureAuthProvider } from './AzureAuthProvider.js';
import { AuthProvider } from './AuthProvider.js';

export class AuthProviderFactory {
    static createProvider(
        name: string,
        institutionId?: string,
        isDefault: boolean = false
    ): AuthProvider {
        switch (name) {
            case 'Google':
                return new GoogleAuthProvider(isDefault);
            case 'Shibboleth':
                return new ShibbolethAuthProvider(isDefault);
            case 'SAML':
                if (!institutionId) {
                    throw new Error('Institution ID is required for SAML provider');
                }
                return new SamlAuthProvider(institutionId, isDefault);
            case 'Azure':
                return new AzureAuthProvider(isDefault);
            default:
                throw new Error(`Unsupported provider: ${name}`);
        }
    }
} 