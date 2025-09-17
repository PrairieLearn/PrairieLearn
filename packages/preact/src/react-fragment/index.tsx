import { observe } from 'selector-observer';
import superjson from 'superjson';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { hydrate } from '@prairielearn/preact-cjs';

import { ReactFragmentsRegistry } from './registry.js';

export const registry = new ReactFragmentsRegistry();

// This file, if imported, will register a selector observer that will hydrate
// React fragments on the client.

onDocumentReady(() => {
  observe('.js-react-fragment', {
    async add(el) {
      const componentName = el.getAttribute('data-component');
      if (!componentName) {
        throw new Error('js-react-fragment element must have a data-component attribute');
      }

      // If you forget to register a component with `registerReactFragment`, this is going to hang.
      const Component = await registry.getReactFragment(componentName);

      const dataElement = el.querySelector('script[data-component-props]');
      if (!dataElement) throw new Error('No data element found');
      if (!dataElement.textContent) throw new Error('Data element has no content');
      const data: object = superjson.parse(dataElement.textContent);

      const rootElement = el.querySelector('div[data-component-root]');
      if (!rootElement) throw new Error('No root element found');
      hydrate(<Component {...data} />, rootElement);
    },
  });
});
