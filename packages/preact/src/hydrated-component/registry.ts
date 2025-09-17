import type { ComponentType } from 'preact';

import { type DeferredPromise, deferredPromise } from './deferred-promise.js';

type AugmentedDeferredPromise<T> = DeferredPromise<T> & {
  resolved: boolean;
};

export class HydratedComponentsRegistry {
  private components: Record<string, AugmentedDeferredPromise<ComponentType<any>>> = {};

  setComponent(id: string, component: ComponentType<any>) {
    if (this.components[id]?.resolved) {
      throw new Error(`React fragment with id ${id} already resolved`);
    }

    if (!this.components[id]) {
      this.components[id] = { ...deferredPromise(), resolved: false };
    }
    this.components[id].resolve(component);
    this.components[id].resolved = true;
  }

  getComponent(id: string): Promise<ComponentType<any>> {
    if (!this.components[id]) {
      // This promise will be resolved later when the component is registered via `setFragment`.
      this.components[id] = {
        ...deferredPromise(),
        resolved: false,
      };
    }

    return this.components[id].promise;
  }
}
