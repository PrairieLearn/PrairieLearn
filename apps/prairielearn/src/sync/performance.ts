const scopedData: Record<string, Record<string, number>> = {};

interface Performance {
  start: (name: string) => void;
  end: (name: string) => void;
  timedAsync: <T>(name: string, asyncFunc: () => Promise<T>) => Promise<T>;
}

export function makePerformance(scopeName: string): Performance {
  if (!scopedData[scopeName]) {
    scopedData[scopeName] = {};
  }

  const scope = scopedData[scopeName];

  function start(name: string): void {
    scope[name] = Date.now();
  }

  function end(name: string): void {
    if (name in scope && process.env.PROFILE_SYNC) {
      console.log(`${name} took ${Date.now() - scope[name]}ms`);
    }
  }

  async function timedAsync<T>(name: string, asyncFunc: () => Promise<T>): Promise<T> {
    start(name);
    let res: T;
    try {
      res = await asyncFunc();
    } finally {
      end(name);
    }
    return res;
  }

  return { start, end, timedAsync };
}
