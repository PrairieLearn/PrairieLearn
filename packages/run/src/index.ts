export function run<T>(fn: () => T): T {
  return fn();
}

export const forTestOnly = 1;
