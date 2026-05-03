import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type ExecutorResults, handleInput } from '../executor-lib.js';
import { CodeCallerNative } from '../lib/code-caller/code-caller-native.js';

/**
 * Smoke tests for the executor image. This code path is similar to the
 * production code path with privilege dropping: Node -> Python zygote -> privilege
 * drop -> element code -> response.
 *
 * TODO: consider creating `CodeCallerContainer` and interacting via that path.
 *
 * Elements are chosen specifically because they import third-party packages
 * NOT in the zygote pre-load list. This is the exact
 * class of failure from https://github.com/PrairieLearn/PrairieLearn/issues/14197 where lazy imports failed because the
 * Python installation was inaccessible after dropping privileges.
 *
 * These tests are designed to run inside the prairielearn/executor Docker
 * container where the `executor` user exists and `dropPrivileges` works.
 */

function assertSuccess(result: ExecutorResults) {
  expect(result.error).toBeUndefined();
  expect(result.functionMissing).toBe(false);
}

describe('executor smoke tests', () => {
  let codeCaller: CodeCallerNative;

  beforeAll(async () => {
    codeCaller = await CodeCallerNative.create({
      dropPrivileges: true,
      questionTimeoutMilliseconds: 30_000,
      pingTimeoutMilliseconds: 60_000,
      errorLogger: console.error,
    });
  });

  afterAll(() => {
    codeCaller.done();
  });

  const testCases = [
    {
      element: 'pl-checkbox',
      note: 'pre-loaded modules only',
      html: '<pl-checkbox answers-name="ans"><pl-answer correct="true">correct</pl-answer></pl-checkbox>',
      data: { params: {}, correct_answers: {}, answers_names: {} },
      extraAssertions: (result: ExecutorResults) => {
        expect(result.data.params.ans).toBeDefined();
        expect(result.data.correct_answers.ans).toBeDefined();
      },
    },
    {
      element: 'pl-symbolic-input',
      note: 'imports sympy',
      html: '<pl-symbolic-input answers-name="ans" variables="x" />',
      data: { params: {}, correct_answers: {}, answers_names: {} },
    },
    {
      element: 'pl-dataframe',
      note: 'imports pandas',
      html: '<pl-dataframe params-name="df" />',
      data: { params: {}, correct_answers: {}, answers_names: {} },
    },
    {
      element: 'pl-graph',
      note: 'imports pygraphviz',
      html: '<pl-graph params-name="g" />',
      data: { params: {}, correct_answers: {}, answers_names: {}, extensions: {} },
    },
  ];

  it.each(testCases)(
    'prepares $element ($note)',
    async ({ element, html, data, extraAssertions }) => {
      const result = await handleInput(
        JSON.stringify({
          type: 'core-element',
          directory: element,
          file: element,
          fcn: 'prepare',
          args: [html, data],
        }),
        codeCaller,
      );

      assertSuccess(result);
      extraAssertions?.(result);
    },
  );
});
