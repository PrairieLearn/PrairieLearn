// These functions are separated from the other utilities so that they can be imported
// on the client. `index.tsx` imports `@prairielearn/compiled-assets`, which
// cannot be bundled for the browser.
import { render } from 'preact-render-to-string/jsx';

import { HtmlSafeString, escapeHtml, unsafeHtml } from '@prairielearn/html';
import { type ComponentType, type VNode } from '@prairielearn/preact-cjs';

interface DeferredPromise<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: any) => void;
}

/**
 * Returns an object that can be used to resolve or reject a promise from
 * the outside.
 */
function deferredPromise<T>(): DeferredPromise<T> {
  let resolve: ((value: T) => void) | undefined, reject: ((reason: any) => void) | undefined;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  if (resolve === undefined || reject === undefined) {
    throw new Error('resolve or reject is undefined');
  }
  return {
    resolve,
    reject,
    promise,
  };
}

/**
 * Render a non-interactive Preact component that is embedded within a tagged template literal.
 * This function is intended to be used within a tagged template literal, e.g. html`...`.
 *
 * @param vnode - A Preact VNode to render to HTML.
 * @returns An `HtmlSafeString` containing the rendered HTML.
 */
export function renderHtml(vnode: VNode | string): HtmlSafeString {
  let pretty = false;

  // In development mode, render HTML with pretty formatting. This is easier to
  // debug, especially in test cases. This will only do anything on the server,
  // but that's fine as we won't ever be looking at HTML that's rendered on the client.
  if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    pretty = true;
  }

  if (typeof vnode === 'string') {
    return escapeHtml(new HtmlSafeString([vnode], []));
  }

  return unsafeHtml(render(vnode, {}, { pretty, jsx: false }));
}

type AugmentedDeferredPromise<T> = DeferredPromise<T> & {
  resolved: boolean;
};

export class ReactFragmentsRegistry {
  private fragments: Record<string, AugmentedDeferredPromise<ComponentType<any>>> = {};

  setReactFragment(id: string, component: ComponentType<any>) {
    if (this.fragments[id]?.resolved) {
      throw new Error(`React fragment with id ${id} already resolved`);
    }

    if (!this.fragments[id]) {
      this.fragments[id] = { ...deferredPromise(), resolved: false };
    }
    this.fragments[id].resolve(component);
    this.fragments[id].resolved = true;
  }

  getReactFragment(id: string): Promise<ComponentType<any>> {
    if (!this.fragments[id]) {
      // This promise will be resolved later when the component is registered via `setReactFragment`.
      this.fragments[id] = {
        ...deferredPromise(),
        resolved: false,
      };
    }

    return this.fragments[id].promise;
  }
}

export function registerReactFragment(component: ComponentType<any>, nameOverride?: string) {
  // Each React component that will be hydrated on the page must be registered.
  // Note that we don't try to use `component.name` since it can be minified or mangled.
  const id = nameOverride ?? component.displayName;
  if (!id) {
    throw new Error('React fragment must have a displayName or nameOverride');
  }
  registry.setReactFragment(id, component);
}

// Global registry instance
export const registry = new ReactFragmentsRegistry();
