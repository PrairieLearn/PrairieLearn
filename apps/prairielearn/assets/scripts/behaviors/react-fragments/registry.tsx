import { type ComponentType } from '@prairielearn/preact-cjs';
import { type PromiseWithResolvers, withResolvers } from '@prairielearn/utils';

type AugmentedPromiseWithResolvers<T> = PromiseWithResolvers<T> & {
  resolved: boolean;
};

export class ReactFragmentsRegistry {
  private fragments: Record<string, AugmentedPromiseWithResolvers<ComponentType<any>>> = {};

  setReactFragment(id: string, component: ComponentType<any>) {
    if (this.fragments[id]?.resolved) {
      throw new Error(`React fragment with id ${id} already resolved`);
    }

    if (!this.fragments[id]) {
      this.fragments[id] = { ...withResolvers(), resolved: false };
    }
    this.fragments[id].resolve(component);
    this.fragments[id].resolved = true;
  }

  getReactFragment(id: string): Promise<ComponentType<any>> {
    if (!this.fragments[id]) {
      // This promise will be resolved later when the component is registered via `setReactFragment`.
      this.fragments[id] = {
        ...withResolvers(),
        resolved: false,
      };
    }

    return this.fragments[id].promise;
  }
}
