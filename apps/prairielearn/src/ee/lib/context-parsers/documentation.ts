import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';

const DEPRECATED_ELEMENTS = new Set(['pl-prairiedraw-figure', 'pl-threejs', 'pl-variable-score']);

interface ElementSection {
  elementName: string;
  content: any[];
}

export interface DocumentChunk {
  text: string;
  chunkId: string;
}

function extractElementSections(ast: any) {
  const elementSections: ElementSection[] = [];

  // Find the first level-three heading.
  let startIndex = ast.children.findIndex((child) => {
    return child.type === 'heading' && child.depth === 3;
  });

  if (startIndex === -1) {
    throw new Error('No element sections found');
  }

  while (startIndex !== -1) {
    const heading = ast.children[startIndex];

    // All element headings should be level 3.
    if (heading.type !== 'heading' || heading.depth !== 3) {
      throw new Error('Expected heading');
    }

    // Element headings should contain an `inlineCode` node.
    const inlineCode = heading.children[0];
    if (inlineCode.type !== 'inlineCode') {
      throw new Error('Expected inline code');
    }

    const elementName = inlineCode.value;

    // Find the next level 2/3 heading.
    let endIndex = ast.children.findIndex((child, index) => {
      return (
        index > startIndex && child.type === 'heading' && (child.depth === 2 || child.depth === 3)
      );
    });

    // If there is no next heading, use the end of the document.
    if (endIndex === -1) {
      endIndex = ast.children.length;
    }

    const content = ast.children.slice(startIndex + 1, endIndex);
    elementSections.push({ elementName, content });

    startIndex = ast.children.findIndex((child, index) => {
      return index >= endIndex && child.type === 'heading' && child.depth === 3;
    });
  }

  return elementSections;
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

function cleanElementSections(elementSections: ElementSection[]) {
  elementSections.forEach((section) => {
    // Remove sections that aren't useful for the context.
    removeHeadingAndContent('Example implementations', section.content);
    removeHeadingAndContent('See also', section.content);

    // Remove thematic breaks.
    section.content = section.content.filter((node) => node.type !== 'thematicBreak');

    // Rewrite all headings so that they can be nested under L2 headings.
    section.content.forEach((node) => {
      if (node.type === 'heading') {
        // Safety check: all headings should be at least level 4.
        if (node.depth < 4) {
          console.error(section.content);
          throw new Error('Expected heading to be at least level 4');
        }
        node.depth -= 1;
      }
      return node;
    });

    return section;
  });

  // Remove deprecated elements.
  return elementSections.filter((section) => !DEPRECATED_ELEMENTS.has(section.elementName));
}

export async function buildContextForElementDocs(rawMarkdown: string): Promise<DocumentChunk[]> {
  const file = unified().use(remarkParse).parse(rawMarkdown);

  const elementSections = cleanElementSections(extractElementSections(file));

  const contexts = elementSections.map((section) => {
    section.content.unshift({
      type: 'heading',
      depth: 2,
      children: [{ type: 'text', value: section.elementName }],
    });
    const markdown = unified().use(remarkStringify).stringify({
      type: 'root',
      children: section.content,
    });

    return {
      chunkId: section.elementName,
      text: markdown,
    };
  });

  return contexts;
}
