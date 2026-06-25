import type { CustomTag } from '@prairielearn/tree-sitter-htmlmustache/linter';

// On-disk-only linter settings layered onto the shared `htmlMustacheConfig`
// when `scripts/gen-element-schemas.mts` generates `.htmlmustache.jsonc`. The
// runtime `Config` type omits top-level and per-rule `include`/`exclude` (the
// in-memory API has no filesystem to match against), so the CLI-only file
// globs and plugin path live here instead. Run `make update-element-schemas`
// after editing.

export const cliInclude = [
  'apps/prairielearn/elements/**/*.mustache',
  'exampleCourse/**/question.html',
  'testCourse/**/question.html',
  'apps/prairielearn/src/tests/**/question.html',
];

export const cliExclude = [
  // Uses legacy v2 EJS syntax (<% %>) which cannot be parsed as mustache.
  'testCourse/questions/addVectors/question.html',
  // Deliberately omits required element attributes to exercise prepare-time errors.
  'testCourse/questions/brokenPrepare/question.html',
];

export const cliPluginModule = './apps/prairielearn/src/lib/element-schemas/htmlmustache-plugin.ts';

// Per-rule file excludes for the on-disk linter. These rules are advisory for
// course content but must not fire on the element templates themselves (which
// legitimately contain raw inputs/images), and only the CLI lints those.
export const cliRuleExcludes: Record<string, string[]> = {
  'pl-prefer-pl-inputs': ['apps/prairielearn/elements/**/*.mustache'],
  'pl-prefer-pl-figure': ['apps/prairielearn/elements/**/*.mustache'],
};

// Custom tags that aren't PrairieLearn elements. Only the on-disk CLI lints the
// files that use them, so they're intentionally absent from `htmlMustacheConfig`.
export const nonPlCustomTags: CustomTag[] = [
  { name: 'clickable-image' },
  { name: 'course-element' },
  { name: 'extendable-element' },
  { name: 'math-field', allowBooleanAttributes: true },
];
