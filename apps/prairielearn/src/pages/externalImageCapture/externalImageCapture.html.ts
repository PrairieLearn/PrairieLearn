import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';

export function ExternalImageCapture({ variantId, elementUUID, resLocals }: { variantId: string, elementUUID: string, resLocals: Record<string, any> }) {

    console.log('External image capture!');

    return PageLayout({
        resLocals,
        pageTitle: 'External image capture',
        navContext: {
            type: 'student',
            page: 'assessment_instance'
        },
        content: html`
            <h1>External image capture</h1>
            <p>Variant ID: ${variantId}</p>
            <p>Element UUID: ${elementUUID}</p>
        `
    })
}