import type * as opentelemetry from '@prairielearn/opentelemetry';

export interface CodeCallerResult {
  result: any;
  output: string;
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

export class FunctionMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

export function developmentSpanEvent(
  span: opentelemetry.Span | null | undefined,
  name: string,
  attributes?: opentelemetry.Attributes,
) {
  if (process.env.NODE_ENV === 'production' || !span) return;

  span?.addEvent(name, attributes);
}
