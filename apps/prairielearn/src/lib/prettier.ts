export const PRETTIER_CONFIG = {
  tabWidth: 2,
  printWidth: 100,
};

export async function formatJsonWithPrettier(json: string): Promise<string> {
  // Dynamic imports are used to avoid slowing down server startup.
  const prettier = await import('prettier/standalone');
  const prettierBabelPlugin = await import('prettier/plugins/babel');
  const prettierEstreePlugin = await import('prettier/plugins/estree');

  return prettier.format(json, {
    parser: 'json',
    plugins: [prettierBabelPlugin.default, prettierEstreePlugin.default],
    ...PRETTIER_CONFIG,
  });
}
