import { assert, describe, it } from 'vitest';

import { ElementLocalFilePathJsonSchema } from './elementLocalFilePath.js';
import { ElementCoreJsonSchema } from './infoElementCore.js';
import { ElementCourseJsonSchema } from './infoElementCourse.js';

describe('element-local file paths', () => {
  it.each(['controller.py', 'scripts/editor.js', 'styles/nested/element.css'])(
    'accepts %s',
    (path) => {
      assert.isTrue(ElementLocalFilePathJsonSchema.safeParse(path).success);
    },
  );

  it.each([
    ['parent traversal', '../other-element/file.js'],
    ['nested parent traversal', 'scripts/../file.js'],
    ['absolute POSIX path', '/tmp/file.js'],
    ['Windows drive path', String.raw`C:\elements\file.js`],
    ['Windows drive-relative path', String.raw`C:..\other-element\file.js`],
    ['backslash traversal', String.raw`..\other-element\file.js`],
    ['encoded parent traversal', '%2e%2e/other-element/file.js'],
    ['mixed encoded parent traversal', '.%2E/other-element/file.js'],
    ['encoded path separator', '..%2fother-element/file.js'],
  ])('rejects %s', (_description, path) => {
    assert.isFalse(ElementLocalFilePathJsonSchema.safeParse(path).success);
  });

  it('applies to every core element-local file field', () => {
    const invalidPath = '../pl-other/file.js';
    const configs = [
      { controller: invalidPath },
      { controller: 'controller.py', dependencies: { elementScripts: [invalidPath] } },
      { controller: 'controller.py', dependencies: { elementStyles: [invalidPath] } },
      {
        controller: 'controller.py',
        dynamicDependencies: { elementScripts: { module: invalidPath } },
      },
    ];

    for (const config of configs) {
      assert.isFalse(ElementCoreJsonSchema.safeParse(config).success);
    }
  });

  it('preserves existing course element path behavior', () => {
    const legacyPath = '../shared/file.js';
    const configs = [
      { controller: legacyPath },
      { controller: 'controller.py', dependencies: { elementScripts: [legacyPath] } },
      { controller: 'controller.py', dependencies: { elementStyles: [legacyPath] } },
      {
        controller: 'controller.py',
        dynamicDependencies: { elementScripts: { module: legacyPath } },
      },
    ];

    for (const config of configs) {
      assert.isTrue(ElementCourseJsonSchema.safeParse(config).success);
    }
  });
});
