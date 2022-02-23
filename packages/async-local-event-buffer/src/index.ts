import { AsyncLocalStorage } from 'async_hooks';

interface Message {
  timestamp: Date;
  message: string;
  data?: any;
}

interface EventBuffer {
  push: (msg: string, data?: any) => void;
  flush: () => Message[];
}

const als = new AsyncLocalStorage<EventBuffer>();

const noopBuffer: EventBuffer = {
  push: (msg: string, data: any) => {},
  flush: () => {
    return [];
  },
};

export const eventBuffer = new Proxy(noopBuffer, {
  get(target, property, receiver) {
    let realTarget = als.getStore() ?? target;
    return Reflect.get(realTarget, property, receiver);
  },
});

export const runWithEventBuffer = (fn: () => Promise<void> | void) => {
  const messages = [];

  const buffer: EventBuffer = {
    push: (msg: string, data: any) => {
      // Capture the location of the calling function to aid with debugging.
      const e = new Error();
      const stack = e.stack?.split('\n');
      let location = stack?.[2]?.trim().replace(/^at /, '');

      // The location sometimes looks like this:
      //  at Object.<anonymous> (/Users/.../.../.../src/index.ts:12:5)
      // We want to isolate the file path and line number.
      const match = location.match(/^(.*) \((.*:\d+:\d+)\)$/);
      if (match) {
        location = match[2];
      }

      messages.push({
        timestamp: new Date(),
        message: msg,
        location,
        data,
      });
    },
    flush: () => {
      return messages.splice(0);
    },
  };

  return als.run(buffer, fn);
};
