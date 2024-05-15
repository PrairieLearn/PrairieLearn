import { ChildProcess } from 'child_process';
import { Readable, Writable } from 'stream';

export interface CodeCallerNativeChildProcess extends ChildProcess {
  stdio: [Writable, Readable, Readable, Readable, Readable];
}
