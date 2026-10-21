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
    ['backslash traversal', String.raw`..\other-element\file.js`],
  ])('rejects %s', (_description, path) => {
    assert.isFalse(ElementLocalFilePathJsonSchema.safeParse(path).success);
  });

  it.each([
    ['core', ElementCoreJsonSchema],
    ['course', ElementCourseJsonSchema],
  ])('applies to every %s element-local file field', (_name, schema) => {
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
      assert.isFalse(schema.safeParse(config).success);
    }
  });
});
