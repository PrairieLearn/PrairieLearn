import { type ChildProcess } from 'child_process';
import { type Readable, type Writable } from 'stream';

export interface CodeCallerNativeChildProcess extends ChildProcess {
  stdio: [Writable, Readable, Readable, Readable, Readable];
}
