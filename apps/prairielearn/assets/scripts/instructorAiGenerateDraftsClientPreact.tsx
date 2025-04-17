import { render } from 'preact';
import { Fragment, h, render } from 'preact';

import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
    const preactTestComponent = document.querySelector('#preact-test-component') as HTMLElement;
    console.log('preactTestComponent', preactTestComponent);

    function TestComponent() {
        return <div>
            <p>Hello</p>
        </div>
    }

    render(
        <TestComponent />,
        preactTestComponent
    );
})
