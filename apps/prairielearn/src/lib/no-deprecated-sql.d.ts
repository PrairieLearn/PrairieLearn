import '@prairielearn/postgres';

declare module '@prairielearn/postgres' {
  export const queryAsync: never;
  export const queryZeroOrOneRowAsync: never;
  export const callOneRowAsync: never;
  export const callZeroOrOneRowAsync: never;
}
