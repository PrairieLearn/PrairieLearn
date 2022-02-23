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
      messages.push({
        timestamp: new Date(),
        message: msg,
        data,
      });
    },
    flush: () => {
      return messages.splice(0);
    },
  };

  return als.run(buffer, fn);
};
