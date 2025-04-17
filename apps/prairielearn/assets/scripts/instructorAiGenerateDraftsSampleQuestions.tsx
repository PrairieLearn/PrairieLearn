
import { h } from 'preact';
import { Button } from 'react-bootstrap';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { render } from '@prairielearn/preact-cjs';


onDocumentReady(() => {
    const sampleQuestions = document.querySelector('#sample-questions') as HTMLElement;
    
    function SampleQuestion() {
        return (
            <div>
                <Button variant="primary">Hello from Preact + React-Bootstrap</Button>
            </div>
        )
    }

    render(
        <SampleQuestion />,
        sampleQuestions
    );
})
