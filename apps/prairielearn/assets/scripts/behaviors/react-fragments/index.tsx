import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';
import { hydrate, type ComponentType } from '@prairielearn/preact-cjs';

import { ReactFragmentsRegistry } from './registry.js';

const registry = new ReactFragmentsRegistry();

export function registerReactFragment(id: string, component: ComponentType<any>) {
  registry.setReactFragment(id, component);
}

onDocumentReady(() => {
  observe('.js-react-fragment', {
    async add(el) {
      const id = el.id;
      if (!id) throw new Error('js-react-fragment element must have an id');

      // TODO: use a separate `data-component` attribute instead of the id?
      const Component = await registry.getReactFragment(id);

      const dataElement = el.querySelector(`script#${id}-props`);
      if (!dataElement) throw new Error('No data element found');
      if (!dataElement.textContent) throw new Error('Data element has no content');
      const data = JSON.parse(dataElement.textContent);

      const rootElement = el.querySelector(`div#${id}-root`);
      if (!rootElement) throw new Error('No root element found');

      hydrate(<Component {...data} />, rootElement);
    },
  });
});
