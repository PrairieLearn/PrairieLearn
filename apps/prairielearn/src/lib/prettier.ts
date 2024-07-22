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
  // we use the most compact formatting possible:
  // https://prettier.io/docs/en/rationale.html#multi-line-objects
  json = JSON.stringify(JSON.parse(json));

  return prettier.format(json, {
    parser: 'json',
    plugins: [
      prettierBabelPlugin,
      // @ts-expect-error -- See below issues:
      // https://github.com/prettier/prettier/issues/16501
      // https://github.com/privatenumber/tsx/issues/617
      prettierEstreePlugin,
    ],
    ...PRETTIER_CONFIG,
  });
}
