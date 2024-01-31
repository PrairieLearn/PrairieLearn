declare module 'async-stacktrace' {
  // This module is already on the way out and shouldn't be used in properly
  // type-safe code, so we'll allow the usage of `Function` here.
  // eslint-disable-next-line @typescript-eslint/ban-types
  function ERR(err: Error | null | undefined, callback: Function): boolean;

  export = ERR;
}
