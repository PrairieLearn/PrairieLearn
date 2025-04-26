import { type BootstrapTableOptions } from 'bootstrap-table';

// https://bootstrap-table.com/docs/api/table-options/#buttons
interface ButtonConfig {
  text?: string;
  icon?: string;
  render?: boolean;
  attributes?: {
    title?: string;
    [key: string]: string | undefined;
  };
  html?: string | ((data: any) => string);
  event?: ((data: any) => void) | Record<string, unknown> | string;
}

// Cannot find better types in upstream or definitely-typed
export type ExtendedBootstrapTableOptions = BootstrapTableOptions & {
  buttons: Record<string, ButtonConfig>;
};
