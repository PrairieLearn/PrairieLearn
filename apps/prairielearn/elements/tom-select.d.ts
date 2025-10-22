// Minimal type definitions for TomSelect
declare class TomSelect {
  constructor(element: HTMLSelectElement, options: any);
  wrapper: HTMLElement;
  control: HTMLElement;
  setActiveOption(option: HTMLElement | null, scroll?: boolean): void;
  open(): void;
  positionDropdown(): void;
}

