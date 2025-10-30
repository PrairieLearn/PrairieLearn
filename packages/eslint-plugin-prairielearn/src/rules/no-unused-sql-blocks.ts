import * as fs from 'fs';
import * as path from 'path';

import { ESLintUtils } from '@typescript-eslint/utils';

function extractSqlBlockDefinitions(sqlContent: string): Set<string> {
  const regex = / *-- *BLOCK +([^ \n]+) */g;
  const defs = new Set<string>();
  let match;
  while ((match = regex.exec(sqlContent)) !== null) {
    defs.add(match[1]);
  }
  return defs;
}

function extractSqlBlockReferences(tsContent: string): Set<string> {
  const regex = /sql\.([a-zA-Z0-9_]+)/g;
  const refs = new Set<string>();
  let match;
  while ((match = regex.exec(tsContent)) !== null) {
    refs.add(match[1]);
  }
  return refs;
}

export default ESLintUtils.RuleCreator.withoutDocs({
  meta: {
    type: 'problem',
    messages: {
      unusedSqlBlock:
        'SQL block "{{block}}" in "{{sqlFile}}" is not used in this file and should be deleted.',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const components = path.parse(context.filename);
    components.ext = '.sql';
    const sqlFile = path.join(components.dir, components.name) + components.ext;
    if (!fs.existsSync(sqlFile)) return {};
    const tsContent = fs.readFileSync(context.filename, 'utf8');
    const sqlContent = fs.readFileSync(sqlFile, 'utf8');

    const usedBlocks = extractSqlBlockReferences(tsContent);
    const definedBlocks = extractSqlBlockDefinitions(sqlContent);

    const unusedBlocks = [...definedBlocks].filter((block) => !usedBlocks.has(block));

    return {
      Program(node) {
        for (const block of unusedBlocks) {
          context.report({
            node,
            loc: {
              start: { line: 1, column: 1 },
              end: { line: 2, column: 0 },
            },
            messageId: 'unusedSqlBlock',
            data: { block, sqlFile: path.basename(sqlFile) },
          });
        }
      },
    };
  },
});
