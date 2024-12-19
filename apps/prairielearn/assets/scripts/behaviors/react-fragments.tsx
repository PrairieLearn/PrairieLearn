import { h } from 'preact';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const REACT_FRAGMENTS: Record<string, any> = {
  InstructorInstanceAdminBillingForm: () =>
    import('../../../src/ee/lib/billing/components/InstructorInstanceAdminBillingForm.js').then(
      (m) => m.InstructorInstanceAdminBillingForm,
    ),
};

onDocumentReady(() => {
  observe('.js-react-fragment', {
    async add(el) {
      const id = el.id;
      if (!id) throw new Error('js-react-fragment element must have an id');
      if (!REACT_FRAGMENTS[id]) throw new Error(`No React fragment with id ${id}`);

      const { hydrate } = await import('preact');

      const dataElement = el.querySelector(`script#${id}-props`);
      if (!dataElement) throw new Error('No data element found');
      if (!dataElement.textContent) throw new Error('Data element has no content');
      const data = JSON.parse(dataElement.textContent);

      const rootElement = el.querySelector(`div#${id}-root`);
      if (!rootElement) throw new Error('No root element found');

      const Component = await REACT_FRAGMENTS[id]();

      hydrate(<Component {...data} />, rootElement);
    },
  });
});
