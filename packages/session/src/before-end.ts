import type { NextFunction } from 'express';

/**
 * The following function is based on code from `express-session`:
 *
 * https://github.com/expressjs/session/blob/1010fadc2f071ddf2add94235d72224cf65159c6/index.js#L246-L360
 *
 * This code is used to work around the fact that Express doesn't have a good
 * hook to allow us to perform some asynchronous operation before the response
 * is written to the client.
 *
 * Note that this is truly only necessary for Express. Other Node frameworks
 * like Fastify and Adonis have hooks that allow us to do this without any
 * hacks. It's also probably only useful in the context of Express, as it
 * seems to rely on the fact that Express and its ecosystem generally don't
 * call `end()` without an additional chunk of data. If it instead called
 * `write()` with the final data and then `end()` with no data, this code
 * wouldn't function as intended. It's possible that `stream.pipe(res)` does
 * in fact behave this way, so it's probably not completely safe to use this
 * code when streaming responses back to the client.
 *
 * One could probably make this safer by *also* hooking into `response.write()`
 * and buffering the data. My understanding of Node streams isn't good enough
 * to implement that, though.
 */
export function beforeEnd(res: any, next: NextFunction, fn: () => Promise<void>) {
  const _end = res.end as any;
  const _write = res.write as any;
  let ended = false;

  res.end = function end(chunk: any, encoding: any) {
    if (ended) {
      return false;
    }

    ended = true;

    let ret: any;
    let sync = true;

    function writeend() {
      if (sync) {
        ret = _end.call(res, chunk, encoding);
        sync = false;
        return;
      }

      _end.call(res);
    }

    function writetop() {
      if (!sync) {
        return ret;
      }

      if (!res._header) {
        res._implicitHeader();
      }

      if (chunk == null) {
        ret = true;
        return ret;
      }

      const contentLength = Number(res.getHeader('Content-Length'));

      if (!isNaN(contentLength) && contentLength > 0) {
        chunk = !Buffer.isBuffer(chunk) ? Buffer.from(chunk, encoding) : chunk;
        encoding = undefined;

        if (chunk.length !== 0) {
          ret = _write.call(res, chunk.slice(0, chunk.length - 1));
          chunk = chunk.slice(chunk.length - 1, chunk.length);
          return ret;
        }
      }

      ret = _write.call(res, chunk, encoding);
      sync = false;

      return ret;
    }

    fn().then(
      () => {
        writeend();
      },
      (err) => {
        setImmediate(next, err);
        writeend();
      },
    );

    return writetop();
  };
}
