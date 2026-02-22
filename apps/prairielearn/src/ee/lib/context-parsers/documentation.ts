import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

import { SUPPORTED_ELEMENTS } from '../validateHTML.js';

const DEPRECATED_ELEMENTS = new Set(['pl-prairiedraw-figure', 'pl-variable-score']);

interface ElementSection {
  elementName: string;
  content: any[];
}

export interface DocumentChunk {
  text: string;
  chunkId: string;
}

function stringify(content: any) {
  return unified().use(remarkStringify).use(remarkGfm).stringify({
    type: 'root',
    children: content,
  });
}

function removeHeadingAndContent(headingName: string, contents: any[]) {
  const headingIndex = contents.findIndex((node) => {
    return (
      node.type === 'heading' &&
      node.children[0].type === 'text' &&
      node.children[0].value === headingName
    );
  });

  // Nothing to do if the heading doesn't exist.
  if (headingIndex === -1) return;

  let nextHeadingIndex = contents.findIndex((node, index) => {
    return index > headingIndex && node.type === 'heading';
  });

  // If there is no next heading, remove everything after the heading.
  if (nextHeadingIndex === -1) {
    nextHeadingIndex = contents.length;
  }

  contents.splice(headingIndex, nextHeadingIndex - headingIndex);
}

function writeOutTables(elementSections: ElementSection[]) {
  elementSections.forEach((section) => {
    section.content.forEach((node) => {
      if (node.type === 'table') {
        const firstRow = node.children[0];
        if (
          firstRow.children.length === 4 &&
          firstRow.children[0].children[0].value === 'Attribute' &&
          firstRow.children[1].children[0].value === 'Type' &&
          firstRow.children[2].children[0].value === 'Default' &&
          firstRow.children[3].children[0].value === 'Description'
        ) {
          const statements: any[] = [];
          for (let rowIdx = 1; rowIdx < node.children.length; rowIdx++) {
            const row = node.children[rowIdx];
            const attribute = row.children[0];
            const type = row.children[1];
            const defaultValProcessed = stringify([row.children[2]]).trimEnd();
            const defaultVal = row.children[2];
            const description = row.children[3];

            if (defaultValProcessed !== '-' && defaultValProcessed !== '—') {
              statements.push(
                attribute,
                { type: 'text', value: ': of type ' },
                type,
                { type: 'text', value: ', default val: ' },
                defaultVal,
                { type: 'text', value: ', description: ' },
                description,
              );
            } else {
              statements.push(
                attribute,
                { type: 'text', value: ': of type ' },
                type,
                { type: 'text', value: ', description: ' },
                description,
              );
            }

            if (rowIdx < node.children.length - 1) {
              statements.push({ type: 'text', value: '\n' });
            }
          }
          node.type = 'paragraph';
          node.children = statements;
        }
      }
      return node;
    });
    return section;
  });
  return elementSections;
}

/**
 * Processes a single element documentation file and returns a DocumentChunk.
 *
 * @param rawMarkdown The markdown content of a single element file.
 * @param elementName The name of the element (extracted from filename).
 * @returns A DocumentChunk for the element, or null if the element is not allowed or deprecated.
 */
export function buildContextForSingleElementDoc(
  rawMarkdown: string,
  elementName: string,
): DocumentChunk | null {
  // Skip deprecated elements.
  if (DEPRECATED_ELEMENTS.has(elementName)) {
    return null;
  }

  // Skip unsupported elements.
  if (!SUPPORTED_ELEMENTS.has(elementName)) return null;

  const file = unified().use(remarkParse).use(remarkGfm).parse(rawMarkdown);

  // Get all content after the first heading (which should be the element name).
  // The first heading is typically "# `element-name` element" or similar.
  let contentStartIndex = 0;
  if (file.children.length > 0 && file.children[0].type === 'heading') {
    contentStartIndex = 1;
  }

  const content = file.children.slice(contentStartIndex);

  // Remove sections that aren't useful for the context.
  removeHeadingAndContent('Example implementations', content);
  removeHeadingAndContent('See also', content);

  // Remove thematic breaks.
  const filteredContent = content.filter((node) => node.type !== 'thematicBreak');

  // Rewrite all headings so that they can be nested under L2 headings.
  // In individual files, headings start at level 2 (##), so we need to convert
  // them to level 3+ to match the structure expected by the processing functions.
  filteredContent.forEach((node) => {
    if (node.type === 'heading') {
      // Safety check: all headings should be at least level 2.
      if (node.depth < 2) {
        throw new Error('Expected heading to be at least level 2');
      }
      // Convert level 2 to level 3, level 3 to level 4, etc.
      // This matches the behavior in cleanElementSections which expects level 4+.
      node.depth += 1;
    }
  });

  // Process tables in the same way as the multi-file version.
  const elementSection: ElementSection = { elementName, content: filteredContent };
  const processedSections = writeOutTables([elementSection]);

  // Add a level 2 heading with the element name.
  processedSections[0].content.unshift({
    type: 'heading',
    depth: 2,
    children: [{ type: 'text', value: elementName }],
  });

  const markdown = stringify(processedSections[0].content);

  return {
    chunkId: elementName,
    text: markdown,
  };
}
