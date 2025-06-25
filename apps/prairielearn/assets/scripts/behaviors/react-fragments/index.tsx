import './debug.js';

import { type ComponentType, hydrate } from 'preact';
import { observe } from 'selector-observer';
import superjson from 'superjson';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { ReactFragmentsRegistry } from './registry.js';

const registry = new ReactFragmentsRegistry();

export function registerReactFragment(component: ComponentType<any>, componentName?: string) {
  // Each React component that will be hydrated on the page must be registered.
  const id = componentName || component.name || component.displayName;
  if (!id) {
    throw new Error('React fragment must have a name or displayName or componentName');
  }
  registry.setReactFragment(id, component);
}

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
      const data = superjson.parse(dataElement.textContent) as object;

      const rootElement = el.querySelector('div[data-component-root]');
      if (!rootElement) throw new Error('No root element found');
      hydrate(<Component {...data} />, rootElement);
    },
  });
});
