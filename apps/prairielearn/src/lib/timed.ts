export function timed<T>(fn: () => T, done: (duration: number) => void): T;
export function timed<T>(fn: () => Promise<T>, done: (duration: number) => void): Promise<T>;
export function timed<T>(
  fn: () => T | Promise<T>,
  done: (duration: number) => void,
): T | Promise<T> {
  const start = performance.now();

  const result = fn();

  if (result instanceof Promise) {
    return result.finally(() => {
      const duration = performance.now() - start;
      done(duration);
    });
  } else {
    const duration = performance.now() - start;
    done(duration);
    return result;
  }
}
