import type { ComponentType } from 'preact';

import { type PromiseWithResolvers, withResolvers } from '@prairielearn/utils';

type AugmentedPromiseWithResolvers<T> = PromiseWithResolvers<T> & {
  resolved: boolean;
};

export class HydratedComponentsRegistry {
  private components: Record<string, AugmentedPromiseWithResolvers<ComponentType<any>>> = {};

  setComponent(id: string, component: ComponentType<any>) {
    if (this.components[id]?.resolved) {
      throw new Error(`React fragment with id ${id} already resolved`);
    }

    if (!this.components[id]) {
      this.components[id] = { ...withResolvers<ComponentType<any>>(), resolved: false };
    }
    this.components[id].resolve(component);
    this.components[id].resolved = true;
  }

  getComponent(id: string): Promise<ComponentType<any>> {
    if (!this.components[id]) {
      // This promise will be resolved later when the component is registered via `setFragment`.
      this.components[id] = { ...withResolvers<ComponentType<any>>(), resolved: false };
    }

    return this.components[id].promise;
  }
}
