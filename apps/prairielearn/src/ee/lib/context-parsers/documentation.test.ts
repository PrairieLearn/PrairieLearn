import { assert, describe, it } from 'vitest';

import { buildContextForSingleElementDoc } from './documentation.js';

describe('buildContextForSingleElementDoc', () => {
  it('removes deprecated-attribute sections from element context', () => {
    const context = buildContextForSingleElementDoc(
      `
# \`pl-multiple-choice\` element

## Customizations

| Attribute | Type | Default | Description |
| --- | --- | --- | --- |
| \`all-of-the-above\` | \`"false"\`, \`"random"\`, \`"correct"\`, or \`"incorrect"\` | \`"false"\` | Add \`"All of the above"\` choice. |

### Deprecated attributes

The \`escape-unicode\` attribute is still accepted for backward compatibility.

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
    assert.notInclude(context.text, 'escape-unicode');
    assert.notInclude(context.text, 'all-of-the-above="true"');
  });
});
