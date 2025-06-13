import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { type ComponentType, hydrate } from '@prairielearn/preact-cjs';

import { ReactFragmentsRegistry } from './registry.js';

const registry = new ReactFragmentsRegistry();

export function registerReactFragment(id: string, component: ComponentType<any>) {
  registry.setReactFragment(id, component);
}

onDocumentReady(() => {
  observe('.js-react-fragment', {
    async add(el) {
      const componentName = el.getAttribute('data-component');
      if (!componentName) {
        throw new Error('js-react-fragment element must have a data-component attribute');
      }

      const Component = await registry.getReactFragment(componentName);

      const dataElement = el.querySelector(`script#${componentName}-props`);
      if (!dataElement) throw new Error('No data element found');
      if (!dataElement.textContent) throw new Error('Data element has no content');
      const data = JSON.parse(dataElement.textContent);

      const rootElement = el.querySelector(`div#${componentName}-root`);
      if (!rootElement) throw new Error('No root element found');

      hydrate(<Component {...data} />, rootElement);
    },
  });
});
