export class FunctionMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

export const CREATED = Symbol('CREATED');
export const WAITING = Symbol('WAITING');
export const IN_CALL = Symbol('IN_CALL');
export const EXITING = Symbol('EXITING');
export const EXITED = Symbol('EXITED');

export type CallerState =
  | typeof CREATED
  | typeof WAITING
  | typeof IN_CALL
  | typeof EXITING
  | typeof EXITED;

export const RESTARTING = Symbol('RESTARTING');

export type CodeCallerState = CallerState | typeof RESTARTING;
export type CallType =
  | 'question'
  | 'v2-question'
  | 'course-element'
  | 'core-element'
  | 'ping'
  | 'restart';

export interface PrepareForCourseOptions {
  coursePath: string;
  forbiddenModules: string[];
}

export interface CodeCaller {
  uuid: string;
  getCoursePath: () => string | null;
  ensureChild: () => Promise<void>;
  prepareForCourse: (options: PrepareForCourseOptions) => Promise<void>;
  call: (
    type: CallType,
    directory: string | null,
    file: string | null,
    fcn: string | null,
    args: any[],
  ) => Promise<{ result: any; output: string }>;
  restart: () => Promise<boolean>;
  done: () => void;
}
