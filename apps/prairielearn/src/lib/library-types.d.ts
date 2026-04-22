export interface Library {
    generateLaunchLink(options: {
        keys: string[];
        restartUrl: string;
        locale?: string;
        hideToolbar?: boolean;
        spellCheck?: boolean;
        disableZoom?: boolean;
        enableMic?: boolean;
        enableWebcam?: boolean;
        allowVM?: boolean;
    }): string;
    getHandshakeRedirectUrl(options: {
        keys: string[];
        baseUrl: string;
        blocklist?: string[];
        allowlist?: string[];
        checkProcessList?: boolean;
        proctorExitPassword?: string;
    }): {
        url: string;
        challenge: string;
    };
    validateBrowser(options: {
        keys: string[];
        cookies: Record<string, string>;
        challenge: string;
    }): {
        valid: true;
    } | {
        valid: false;
        retry: true;
    } | {
        valid: false;
        error: string;
    };
    getExamUrl(options: {
        baseUrl: string;
        securityLevel: 'low' | 'medium' | 'medium-high' | 'high' | 'very-high';
        calculator?: 'none' | 'basic' | 'scientific';
        printer?: boolean;
    }): string;
    getExitUrl(options: {
        baseUrl: string;
        returnUrl?: string;
    }): string;
}
