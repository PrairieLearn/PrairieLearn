// Minimal type definitions for TomSelect
declare global {
  class TomSelect {
    constructor(element: HTMLSelectElement, options: TomSelectOptions);
    wrapper: HTMLElement;
    control: HTMLElement;
    setActiveOption(option: Element | null, scroll?: boolean): void;
    open(): void;
    positionDropdown(): void;
  }

  interface TomSelectOptions {
    plugins?: string[];
    allowEmptyOption?: boolean;
    dropdownParent?: string;
    searchField?: string[];
    refreshThrottle?: number;
    openOnFocus?: boolean;
    render?: {
      option?: (data: { content: string } & Record<string, unknown>) => string;
      item?: (data: { content: string; disabled?: boolean } & Record<string, unknown>) => string;
    };
    onDropdownOpen?: (dropdown: HTMLElement) => void;
    onDropdownClose?: () => void;
  }
}

export {};
