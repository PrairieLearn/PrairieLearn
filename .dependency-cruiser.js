/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'Orphaned (no incoming or outgoing dependencies).',
      severity: 'error',
      from: {
        orphan: true,
        pathNot: [
          '(^|/).[^/]+.(js|cjs|mjs|ts|json)$', // dot files
          '.d.ts$', // TypeScript declaration files
          '(^|/)tsconfig.json$', // TypeScript config
          '(^|/)(babel|webpack).config.(js|cjs|mjs|ts|json)$', // other configs
        ],
      },
      to: {},
    },
    {
      name: 'not-to-deprecated',
      comment: 'Depends on a deprecated package.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['deprecated'] },
    },
    {
      name: 'no-non-package-json',
      severity: 'error',
      comment:
        "Depends on an npm package that isn't in the 'dependencies' section of package.json.",
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'not-to-unresolvable',
      comment: "Depends on a module that cannot be found ('resolved to disk').",
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-duplicate-dep-types',
      comment: 'Depends on a duplicated external package.',
      severity: 'warn',
      from: {},
      to: { moreThanOneDependencyType: true, dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'not-to-test',
      comment: 'Non-test code depends on test code.',
      severity: 'error',
      from: {
        // explicitly allow cypressResetDb and prepare-db to import from tests
        pathNot: ['(src/tests)', '[.]test[.][tj]s'],
      },
      to: { path: ['(src/tests)', '[.]test[.][tj]s'] },
    },
    {
      name: 'not-to-dev-dep',
      severity: 'error',
      comment: 'Depends on a devDependency.',
      from: {
        path: '(src)',
        pathNot: [
          '.(spec|test).(js|mjs|cjs|ts|ls|coffee|litcoffee|coffee.md)$',
          'src/tests/',
          '[.]d[.]ts$',
          'test-utils[.]ts$',
        ],
      },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: { path: '[.]yarn/' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    reporterOptions: { text: { highlightFocused: true } },
  },
};
