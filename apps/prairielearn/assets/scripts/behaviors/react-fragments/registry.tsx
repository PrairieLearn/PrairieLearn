import { type ComponentType } from '@prairielearn/preact-cjs';

import { type DeferredPromise, deferredPromise } from '../../../../src/lib/deferred.js';

export class ReactFragmentsRegistry {
  private fragments: Record<string, DeferredPromise<ComponentType<any>>> = {};

  setReactFragment(id: string, component: ComponentType<any>) {
    if (this.fragments[id]) {
      throw new Error(`React fragment with id ${id} already exists`);
    }

    this.fragments[id] = deferredPromise();
    this.fragments[id].resolve(component);
  }

  getReactFragment(id: string): Promise<ComponentType<any>> {
    if (!this.fragments[id]) {
      this.fragments[id] = deferredPromise();
    }

    return this.fragments[id].promise;
  }
}
