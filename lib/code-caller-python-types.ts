import { Readable, Writable } from 'stream';
import { ChildProcess } from 'child_process';

export interface PythonCallerChildProcess extends ChildProcess {
  stdio: [Writable, Readable, Readable, Readable, Readable];
}
