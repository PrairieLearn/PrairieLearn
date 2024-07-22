export const PRETTIER_CONFIG = {
  tabWidth: 2,
  printWidth: 100,
};

export async function formatJsonWithPrettier(json: string): Promise<string> {
  // Dynamic imports are used to avoid slowing down server startup.
  const prettier = await import('prettier/standalone');
  const prettierBabelPlugin = await import('prettier/plugins/babel');
  const prettierEstreePlugin = await import('prettier/plugins/estree');

  // We round-trip the JSON through the JS parser/stringifier to ensure that
  // objects always start on a new line. This ensures Prettier doesn't collapse
  // everything onto one line:
  // https://prettier.io/docs/en/rationale.html#multi-line-objects
  json = JSON.stringify(JSON.parse(json), null, 2);

  return prettier.format(json, {
    parser: 'json',
    plugins: [
      prettierBabelPlugin,
      // @ts-expect-error: https://github.com/prettier/prettier/issues/16501
      prettierEstreePlugin,
    ],
    ...PRETTIER_CONFIG,
  });
}
