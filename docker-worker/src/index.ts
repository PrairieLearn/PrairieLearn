import readline from "readline";
import path from "path";
import {
  PythonCaller,
  CallerOptions,
  FunctionMissingError
} from "./code-caller";

interface Request {
  file: string;
  fcn: string;
  args: any[];
  cwd: string;
  paths: string[];
}

interface Results {
  error?: string;
  data?: any;
  output?: string;
  functionMissing?: boolean;
  needsFullRestart: boolean;
}

async function handleInput(
  line: string,
  caller: PythonCaller
): Promise<Results> {
  return new Promise((resolve, reject) => {
    const request: Request = JSON.parse(line);

    if (request.fcn === "restart") {
      caller.restart((restartErr, success) => {
        resolve({
          data: "success",
          needsFullRestart: !!restartErr || !success
        });
      });
      return;
    }

    const options: CallerOptions = {
      paths: request.paths || [],
      cwd: request.cwd,
      timeout: 20000 // Probably too high; just copied from PrairieLearn
    };

    caller.call(
      request.file,
      request.fcn,
      request.args,
      options,
      (err, data, output) => {
        const functionMissing = err instanceof FunctionMissingError;
        resolve({
          // `FunctionMissingError` shouldn't be propagated as an actual error
          // we'll report it via `functionMissing`
          error: err && !functionMissing ? err.message : undefined,
          data,
          output,
          functionMissing,
          needsFullRestart: false
        });
      }
    );
  });
}

(async () => {
  // Our overall loop looks like this: read a line of input from stdin, spin
  // off a python worker to handle it, and write the results back to stdout.
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  let pc = new PythonCaller();
  pc.ensureChild();

  // Safety check: if we receive more input while handling another request,
  // discard it.
  let processingRequest = false;
  rl.on("line", line => {
    if (processingRequest) {
      // Someone else messed up, ignore this line
      return;
    }
    processingRequest = true;
    handleInput(line, pc)
      .then(results => {
        const { needsFullRestart, ...rest } = results;
        if (needsFullRestart) {
          pc.done();
          pc = new PythonCaller();
          pc.ensureChild();
        }
        console.log(JSON.stringify(rest));
        processingRequest = false;
      })
      .catch(err => {
        console.error(err);
        processingRequest = false;
      });
  });

  rl.on("close", () => {
    // We can't get any more input; die immediately to allow our container
    // to be removed.
    process.exit(0);
  });
})();
