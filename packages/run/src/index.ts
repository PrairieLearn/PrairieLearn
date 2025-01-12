export function run<T>(fn: () => T): T {
  return fn();
}
