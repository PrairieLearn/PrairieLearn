declare module 'async-stacktrace' {
  function ERR(err: Error | null | undefined, callback: (err: Error) => void): void;

  export = ERR;
}
