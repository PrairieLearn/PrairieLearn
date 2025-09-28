/* eslint-disable no-console */
/* eslint-disable @eslint-react/no-array-index-key */
// This is fine because we have no mechanism for 'inserting' line numbers.

/**
 * This is a Tiptap extension for the pl-code element with syntax highlighting and customizable options.
 */
import { Node } from '@tiptap/core';
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import hljs from 'highlight.js';
import { type ComponentType, useEffect, useRef, useState } from 'preact/compat';
import { Button, Dropdown, Form, OverlayTrigger, Popover } from 'react-bootstrap';
import { HexColorPicker } from 'react-colorful';
import { z } from 'zod';

import { supportedLexers } from './pygment-constants.js';

const CodeNodeViewContent = NodeViewContent<'code'>;

// https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/code
const PlCodeComponent = (
  props: ReactNodeViewProps<HTMLDivElement> & {
    updateAttributes: (attrs: Partial<PlCodeAttrs>) => void;
    node: ReactNodeViewProps<HTMLDivElement>['node'] & {
      attrs: PlCodeAttrs;
    };
  },
) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const codeRef = useRef<HTMLPreElement>(null);
  const [highlightedContent, setHighlightedContent] = useState('');

  const attrs = props.node.attrs;
  const updateAttributes = (attrs: Partial<PlCodeAttrs>) => {
    console.log('updateAttributes', attrs);
    props.updateAttributes(attrs);
  };

  console.log('attrs', attrs);
  // Get the text content from the node
  const getTextContent = () => {
    return props.node.textContent || '';
  };

  // Apply syntax highlighting
  const applySyntaxHighlighting = (content: string, language: string) => {
    console.log('language', content, language);
    if (language === 'text' || !language) {
      return content;
    }

    try {
      const highlighted = hljs.highlight(content, { language }).value;
      return highlighted;
    } catch {
      // If highlighting fails, return the original content
      return content;
    }
  };

  // Update highlighted content when language or content changes
  const content = getTextContent();
  useEffect(() => {
    if (!attrs.language) return;
    const highlighted = applySyntaxHighlighting(content, attrs.language);
    setHighlightedContent(highlighted);
  }, [attrs.language, content]);

  // Handle line selection for highlighting
  const handleLineClick = (lineNumber: number, event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();

    if (event.shiftKey && selectedLines.length > 0) {
      // Range selection
      const start = Math.min(...selectedLines);
      const end = Math.max(...selectedLines);
      const newStart = Math.min(start, lineNumber);
      const newEnd = Math.max(end, lineNumber);
      const range = Array.from({ length: newEnd - newStart + 1 }, (_, i) => newStart + i);
      setSelectedLines(range);
    } else if (event.ctrlKey || event.metaKey) {
      // Toggle selection
      if (selectedLines.includes(lineNumber)) {
        setSelectedLines(selectedLines.filter((line) => line !== lineNumber));
      } else {
        setSelectedLines([...selectedLines, lineNumber]);
      }
    } else {
      // Single selection
      setSelectedLines([lineNumber]);
    }
  };

  // Apply line highlighting to selected lines
  const applyLineHighlighting = () => {
    if (selectedLines.length === 0) return;

    updateAttributes({
      highlightLines: [...attrs.highlightLines, ...selectedLines],
    });
    setSelectedLines([]);
  };

  // Remove line highlighting
  const removeLineHighlighting = (lineNumber: number) => {
    updateAttributes({
      highlightLines: attrs.highlightLines.filter((line) => line !== lineNumber),
    });
  };

  // Split content into lines for rendering
  const lines = getTextContent().split('\n');

  return (
    <NodeViewWrapper class="pl-code-wrapper">
      <div class="position-relative">
        {/* Header with language dropdown and options */}
        <div class="d-flex justify-content-between align-items-center bg-light border-bottom p-2">
          <div class="d-flex align-items-center gap-2">
            <Dropdown>
              <Dropdown.Toggle variant="outline-secondary" size="sm">
                {attrs.language || 'None'}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                <Dropdown.Item
                  active={!attrs.language}
                  onClick={() => updateAttributes({ language: null })}
                >
                  None
                </Dropdown.Item>
                {Object.entries(supportedLexers).map(([lang, name]) => (
                  <Dropdown.Item
                    key={lang}
                    active={attrs.language === lang}
                    onClick={() => {
                      console.log('lang', lang);
                      updateAttributes({ language: lang });
                    }}
                  >
                    {name}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>

          <div class="d-flex align-items-center gap-1">
            <OverlayTrigger
              trigger="click"
              placement="bottom"
              overlay={
                <Popover id="options-popover">
                  <Popover.Header as="h3">Code Block Options</Popover.Header>
                  <Popover.Body>
                    <Form>
                      <Form.Check
                        type="checkbox"
                        id="preventSelect"
                        label="Prevent text selection"
                        checked={attrs.preventSelect}
                        onChange={(e) =>
                          updateAttributes({ preventSelect: e.currentTarget.checked })
                        }
                      />
                      <Form.Check
                        type="checkbox"
                        id="copyCodeButton"
                        label="Show copy button"
                        checked={attrs.copyCodeButton}
                        onChange={(e) =>
                          updateAttributes({ copyCodeButton: e.currentTarget.checked })
                        }
                      />
                      <Form.Check
                        type="checkbox"
                        id="showLineNumbers"
                        label="Show line numbers"
                        checked={attrs.showLineNumbers}
                        onChange={(e) =>
                          updateAttributes({ showLineNumbers: e.currentTarget.checked })
                        }
                      />
                    </Form>
                  </Popover.Body>
                </Popover>
              }
            >
              <Button variant="outline-secondary" size="sm">
                <i class="bi bi-gear" />
              </Button>
            </OverlayTrigger>
          </div>
        </div>

        {/* Code content */}
        <div class="position-relative">
          <pre
            ref={codeRef}
            class="hljs border border-primary"
            style={{ margin: 0, padding: '1rem' }}
          >
            <CodeNodeViewContent as="code" />
            {/* <code
              // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
            /> */}
          </pre>

          {/* Line numbers overlay */}
          {attrs.showLineNumbers && (
            <div
              class="position-absolute top-0 start-0 bg-light border-end pe-2 text-muted"
              style={{
                paddingTop: '1rem',
                paddingLeft: '1rem',
                fontFamily: 'monospace',
                fontSize: '0.9em',
                lineHeight: '1.5',
                userSelect: 'none',
                pointerEvents: 'none',
                zIndex: 1,
              }}
            >
              {lines.map((_, index) => (
                <div key={index} style={{ height: '1.5em' }}>
                  {index + 1}
                </div>
              ))}
            </div>
          )}

          {/* Line highlighting overlay */}
          {attrs.highlightLines.length > 0 && (
            <div
              class="position-absolute top-0 start-0"
              style={{
                paddingTop: '1rem',
                paddingLeft: attrs.showLineNumbers ? '3rem' : '1rem',
                pointerEvents: 'none',
                zIndex: 2,
              }}
            >
              {lines.map((_, index) => {
                const lineNumber = index + 1;
                const isHighlighted = attrs.highlightLines.includes(lineNumber);

                return (
                  <div
                    key={index}
                    style={{
                      height: '1.5em',
                      backgroundColor: isHighlighted ? attrs.highlightLinesColor : 'transparent',
                      opacity: 0.3,
                      position: 'relative',
                    }}
                  >
                    {isHighlighted && (
                      <button
                        class="position-absolute top-0 end-0 btn btn-sm btn-outline-danger"
                        style={{ fontSize: '0.7em', padding: '0.1em 0.3em' }}
                        title="Remove highlight"
                        type="button"
                        onClick={() => removeLineHighlighting(lineNumber)}
                      >
                        <i class="bi bi-x" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Line selection overlay for highlighting */}
          <div
            class="position-absolute top-0 start-0"
            style={{
              paddingTop: '1rem',
              paddingLeft: attrs.showLineNumbers ? '3rem' : '1rem',
              zIndex: 3,
            }}
          >
            {lines.map((_, index) => {
              const lineNumber = index + 1;
              const isSelected = selectedLines.includes(lineNumber);

              return (
                // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-static-element-interactions
                <div
                  key={index}
                  style={{
                    height: '1.5em',
                    backgroundColor: isSelected ? 'rgba(0, 123, 255, 0.2)' : 'transparent',
                    cursor: 'pointer',
                  }}
                  onClick={(e) => handleLineClick(lineNumber, e)}
                />
              );
            })}
          </div>
        </div>

        {/* Selection controls */}
        {selectedLines.length > 0 && (
          <div class="bg-primary text-white p-2 d-flex justify-content-between align-items-center">
            <span>
              {selectedLines.length} line{selectedLines.length !== 1 ? 's' : ''} selected
            </span>
            <div class="d-flex gap-2">
              <OverlayTrigger
                trigger="click"
                placement="top"
                show={showColorPicker}
                overlay={
                  <Popover id="color-picker-popover">
                    <Popover.Header as="h3">Choose Highlight Color</Popover.Header>
                    <Popover.Body class="d-flex justify-content-center">
                      <HexColorPicker
                        color={attrs.highlightLinesColor ?? undefined}
                        onChange={(color) => updateAttributes({ highlightLinesColor: color })}
                      />
                    </Popover.Body>
                  </Popover>
                }
                onToggle={setShowColorPicker}
              >
                <Button variant="light" size="sm">
                  Choose Color
                </Button>
              </OverlayTrigger>
              <Button variant="light" size="sm" onClick={applyLineHighlighting}>
                Highlight
              </Button>
              <Button variant="outline-light" size="sm" onClick={() => setSelectedLines([])}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

// If there are any unknown attributes, we will drop into the raw-html extension.
const PlCodeAttrsSchema = z.strictObject({
  language: z.string().nullable().optional().default(null),
  preventSelect: z.boolean().default(false),
  copyCodeButton: z.boolean().default(false),
  showLineNumbers: z.boolean().default(false),
  // Accepts input like 4, 1-3,5-10, and 1,2-5,20.
  highlightLines: z
    .string()
    .nullable()
    .optional()
    .default(null)
    .transform((val) => {
      if (!val) return [];
      return val
        .split(',')
        .flatMap((part) => {
          const [start, end] = part.split('-');
          return Array.from(
            { length: Number.parseInt(end) - Number.parseInt(start) + 1 },
            (_, i) => Number.parseInt(start) + i,
          );
        })
        .sort((a, b) => a - b);
    }),
  highlightLinesColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional()
    .default(null),
});

type PlCodeAttrs = z.infer<typeof PlCodeAttrsSchema>;

type PlCodeOptions = object;

const defaultAttrs = PlCodeAttrsSchema.parse({});

export const PlCode = Node.create<PlCodeOptions>({
  name: 'plCode',
  group: 'block',
  content: 'text*',
  marks: '',
  whitespace: 'pre',
  code: true,
  defining: false,
  atom: true,

  parseHTML() {
    return [
      {
        tag: 'pl-code',
        preserveWhitespace: 'full',
        // attributes: {},
        getAttrs: (element: string | HTMLElement) => {
          if (typeof element === 'string') return false;

          const htmlElement = element;

          // Use Zod schema to validate and parse attributes
          try {
            const attributes = Object.fromEntries(
              Array.from(htmlElement.attributes).map((attr) => [attr.name, attr.value]),
            );
            const attrs = PlCodeAttrsSchema.safeParse(attributes);
            console.log('attrs', attrs);
            if (!attrs.success) return false;

            console.log('attrs.data', attrs.data);
            // ProseMirror expects null or undefined if the check is successful.
            return attrs.data;
          } catch {
            return false;
          }
        },
      },
    ];
  },

  renderHTML({ node }) {
    console.log('node', node.attrs);
    // Only include attributes that are not the default in the rendered HTML.
    console.log(
      'attrs redner',
      Object.fromEntries(Object.keys(PlCodeAttrsSchema.shape).map((key) => [key, node.attrs[key]])),
    );
    // console.log('defaults', defaultAttrs);
    // for (const key of Object.keys(PlCodeAttrsSchema.shape)) {
    //   if (node.attrs[key] !== defaultAttrs[key]) {
    //     console.log('key !=', key, node.attrs[key], defaultAttrs[key]);
    //   } else {
    //     console.log('key ==', key, node.attrs[key], defaultAttrs[key]);
    //   }
    // }
    console.log(
      'node.attrs',
      node.attrs.highlightLines.length,
      defaultAttrs.highlightLines.length,
      node.attrs.highlightLines,
      defaultAttrs.highlightLines,
      node.attrs.highlightLines.some(
        (value, index) => value !== defaultAttrs.highlightLines[index],
      ),
    );
    const nonDefaultDefinedAttrs = Object.fromEntries(
      Object.keys(PlCodeAttrsSchema.shape)
        .filter((key) =>
          Array.isArray(node.attrs[key])
            ? node.attrs[key].length !== defaultAttrs[key].length ||
              node.attrs[key].some((value, index) => value !== defaultAttrs[key][index])
            : node.attrs[key] !== defaultAttrs[key],
        )
        .map((key) => [key, node.attrs[key]]),
    );

    // Serialize the highlightLines array as a string.
    // Collect sequential ranges.

    if (nonDefaultDefinedAttrs.highlightLines) {
      const highlightLines = nonDefaultDefinedAttrs.highlightLines;
      const ranges: string[] = [];
      let start = 0;
      while (start < highlightLines.length) {
        let end = start;
        while (
          end + 1 < highlightLines.length &&
          highlightLines[end + 1] === highlightLines[end] + 1
        ) {
          end++;
        }
        ranges.push(`${highlightLines[start]}-${highlightLines[end]}`);
        start = end + 1;
      }
      nonDefaultDefinedAttrs.highlightLines = ranges.join(',');
    }

    console.log('nonDefaultAttrs', nonDefaultDefinedAttrs);
    return ['pl-code', nonDefaultDefinedAttrs, 0];
  },

  addAttributes() {
    // https://tiptap.dev/docs/editor/extensions/custom-extensions/extend-existing#attributes
    return Object.fromEntries(
      Object.entries(defaultAttrs).map(([key, value]) => [key, { default: value }]),
    );
  },

  addNodeView() {
    return ReactNodeViewRenderer(
      PlCodeComponent as ComponentType<ReactNodeViewProps<HTMLDivElement>>,
    );
  },

  // TODO: Do we want fancy VSCode paste support?
  // https://github.com/ueberdosis/tiptap/blob/0226d42150fc501853fe9fc4497a79477560b476/packages/extension-code-block/src/code-block.ts#L381
});
