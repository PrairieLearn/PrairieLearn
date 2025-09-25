import '../debug.js';

import { observe } from 'selector-observer';
import superjson from 'superjson';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { type ComponentType, hydrate } from '@prairielearn/preact-cjs';

import { HydratedComponentsRegistry } from './registry.js';

// This file, if imported, will register a selector observer that will hydrate
// registered components on the client.

const registry = new HydratedComponentsRegistry();

/**
 * Registers a Preact component for client-side hydration. The component should have a
 * `displayName` property. If it's missing, or the name of the component bundle differs,
 * you can provide a `nameOverride`.
 */
export function registerHydratedComponent(component: ComponentType<any>, nameOverride?: string) {
  // Each React component that will be hydrated on the page must be registered.
  // Note that we don't try to use `component.name` since it can be minified or mangled.
  const id = nameOverride ?? component.displayName;
  if (!id) {
    throw new Error('React fragment must have a displayName or nameOverride');
  }
  registry.setComponent(id, component);
}

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
