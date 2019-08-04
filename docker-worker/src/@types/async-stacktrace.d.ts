declare module "async-stacktrace" {
  function ERR(
    err: Error | null | undefined,
    callback: ((err: Error | null | undefined, ...args: any[]) => void) | null
  ): boolean;

  export = ERR;
}
