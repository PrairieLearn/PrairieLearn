import { assert, describe, it } from 'vitest';

import { buildContextForSingleElementDoc } from './documentation.js';

describe('buildContextForSingleElementDoc', () => {
  it('removes deprecated-attribute sections from element context', () => {
    const context = buildContextForSingleElementDoc(
      `
# \`pl-string-input\` element

## Customizations

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| \`answers-name\` | string | — | Variable name to store data in. |

### Deprecated attributes

The \`escape-unicode\` attribute is still accepted for backward compatibility.

## Details

Use this element for short text answers.
`,
      'pl-string-input',
    );

    assert.isNotNull(context);
    assert.include(context.text, 'answers-name');
    assert.include(context.text, 'short text answers');
    assert.notInclude(context.text, 'escape-unicode');
  });

  it('removes deprecated-attribute migration sections from element context', () => {
    const context = buildContextForSingleElementDoc(
      `
# \`pl-multiple-choice\` element

## Customizations

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| \`all-of-the-above\` | \`"false"\`, \`"random"\`, \`"correct"\`, or \`"incorrect"\` | \`"false"\` | Add \`"All of the above"\` choice. |

### Migrating from deprecated attributes

The following deprecated attributes are still supported for backward compatibility:

| Old syntax | New syntax |
| --- | --- |
| \`all-of-the-above="true"\` | \`all-of-the-above="random"\` |

## Details

Use \`all-of-the-above="random"\` for randomly correct extra choices.
`,
      'pl-multiple-choice',
    );

    assert.isNotNull(context);
    assert.include(context.text, 'all-of-the-above');
    assert.include(context.text, 'randomly correct extra choices');
    assert.notInclude(context.text, 'all-of-the-above="true"');
  });
});
