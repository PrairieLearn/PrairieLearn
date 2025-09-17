import '../debug.js';

import { observe } from 'selector-observer';
import superjson from 'superjson';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { hydrate } from '@prairielearn/preact-cjs';

import { HydratedComponentsRegistry } from './registry.js';

// This file, if imported, will register a selector observer that will hydrate
// registered components on the client.

export const registry = new HydratedComponentsRegistry();

onDocumentReady(() => {
  observe('.js-hydrated-component', {
    async add(el) {
      const componentName = el.getAttribute('data-component');
      if (!componentName) {
        throw new Error('js-hydrated-component element must have a data-component attribute');
      }

      // If you forget to register a component with `registerHydratedComponent`, this is going to hang.
      const Component = await registry.getComponent(componentName);

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
