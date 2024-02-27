/**
 * Represents the result of attempting to load and validate an info file. May
 * contain any combination of errors, warnings, data, and a UUID.
 */
export interface InfoFile<T> {
  errors: string[];
  warnings: string[];
  uuid?: string;
  data?: T;
}

export function hasUuid<T>(infoFile: InfoFile<T>): boolean {
  return !!infoFile.uuid;
}

export function hasErrors<T>(infoFile: InfoFile<T>): boolean {
  return infoFile.errors.length > 0;
}

export function hasWarnings<T>(infoFile: InfoFile<T>): boolean {
  return infoFile.warnings.length > 0;
}

export function hasErrorsOrWarnings<T>(infoFile: InfoFile<T>): boolean {
  return hasErrors(infoFile) || hasWarnings(infoFile);
}

export function stringifyErrors<T>(infoFile: InfoFile<T>): string {
  return infoFile.errors.join('\n');
}

export function stringifyWarnings<T>(infoFile: InfoFile<T>): string {
  return infoFile.warnings.join('\n');
}

export function addError<T>(infoFile: InfoFile<T>, error: string): void {
  infoFile.errors.push(error);
}

export function addErrors<T>(infoFile: InfoFile<T>, errors: string[]): void {
  infoFile.errors = infoFile.errors.concat(errors);
}

export function addWarning<T>(infoFile: InfoFile<T>, warning: string): void {
  infoFile.warnings.push(warning);
}

export function addWarnings<T>(infoFile: InfoFile<T>, warnings: string[]): void {
  infoFile.warnings = infoFile.warnings.concat(warnings);
}

export function makeInfoFile<T>(
  infoFile: Omit<InfoFile<T>, 'errors' | 'warnings'> = {},
): InfoFile<T> {
  return { ...infoFile, errors: [], warnings: [] };
}

export function makeError<T>(error: string): InfoFile<T> {
  return { errors: [error], warnings: [] };
}

export function makeWarning<T>(warning: string): InfoFile<T> {
  return { warnings: [warning], errors: [] };
}
