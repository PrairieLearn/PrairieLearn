export class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

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
