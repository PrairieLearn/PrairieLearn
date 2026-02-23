import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type ExecutorResults, handleInput } from '../executor-lib.js';
import { CodeCallerNative } from '../lib/code-caller/code-caller-native.js';

/**
 * Smoke tests for the executor image. These exercise the full production
 * code path with privilege dropping: Node -> Python zygote -> privilege
 * drop -> element code -> response.
 *
 * Elements are chosen specifically because they import third-party packages
 * NOT in the zygote pre-load list (zygote.py:107-119). This is the exact
 * class of failure from #14197 where lazy imports failed because the
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

  it('prepares pl-checkbox (pre-loaded modules only)', async () => {
    const result = await handleInput(
      JSON.stringify({
        type: 'core-element',
        directory: 'pl-checkbox',
        file: 'pl-checkbox',
        fcn: 'prepare',
        args: [
          '<pl-checkbox answers-name="ans"><pl-answer correct="true">correct</pl-answer></pl-checkbox>',
          { params: {}, correct_answers: {}, answers_names: {} },
        ],
      }),
      codeCaller,
    );

    assertSuccess(result);
    expect(result.data.params.ans).toBeDefined();
    expect(result.data.correct_answers.ans).toBeDefined();
  });

  it('prepares pl-symbolic-input (imports sympy)', async () => {
    const result = await handleInput(
      JSON.stringify({
        type: 'core-element',
        directory: 'pl-symbolic-input',
        file: 'pl-symbolic-input',
        fcn: 'prepare',
        args: [
          '<pl-symbolic-input answers-name="ans" variables="x" />',
          { params: {}, correct_answers: {}, answers_names: {} },
        ],
      }),
      codeCaller,
    );

    assertSuccess(result);
  });

  it('prepares pl-dataframe (imports pandas)', async () => {
    const result = await handleInput(
      JSON.stringify({
        type: 'core-element',
        directory: 'pl-dataframe',
        file: 'pl-dataframe',
        fcn: 'prepare',
        args: [
          '<pl-dataframe params-name="df" />',
          { params: {}, correct_answers: {}, answers_names: {} },
        ],
      }),
      codeCaller,
    );

    assertSuccess(result);
  });

  it('prepares pl-graph (imports pygraphviz)', async () => {
    const result = await handleInput(
      JSON.stringify({
        type: 'core-element',
        directory: 'pl-graph',
        file: 'pl-graph',
        fcn: 'prepare',
        args: [
          '<pl-graph params-name="g" />',
          { params: {}, correct_answers: {}, answers_names: {}, extensions: {} },
        ],
      }),
      codeCaller,
    );

    assertSuccess(result);
  });
});
