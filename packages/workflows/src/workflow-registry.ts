import type { WorkflowDefinition } from './types.js';

const registry = new Map<string, WorkflowDefinition<any>>();

export function registerWorkflow<TState>(definition: WorkflowDefinition<TState>): void {
  if (registry.has(definition.type)) {
    throw new Error(`Workflow type '${definition.type}' is already registered`);
  }
  registry.set(definition.type, definition);
}

export function getWorkflowDefinition(type: string): WorkflowDefinition<unknown> {
  const definition = registry.get(type);
  if (!definition) {
    throw new Error(`No workflow registered for type '${type}'`);
  }
  return definition;
}

export function clearRegistry(): void {
  registry.clear();
}
