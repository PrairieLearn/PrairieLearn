import type { AccessControlJson } from '../../../schemas/accessControl.js';

// Interface for the form data structure that includes nested paths
export interface AccessControlFormData {
  mainRule: AccessControlJson;
  overrides: AccessControlJson[];
}
