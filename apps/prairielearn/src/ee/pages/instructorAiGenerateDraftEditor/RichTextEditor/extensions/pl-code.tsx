/* eslint-disable @eslint-react/no-array-index-key */
// This is fine because we have no mechanism for 'inserting' line numbers.

/**
 * This is a Tiptap extension for the pl-code element with syntax highlighting and customizable options.
 */
import { mergeAttributes } from '@tiptap/core';
import CodeBlock, { type CodeBlockOptions } from '@tiptap/extension-code-block';
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from '@tiptap/react';
import hljs from 'highlight.js';
import { useEffect, useRef, useState } from 'preact/compat';
import { Button, Dropdown, Form, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { HexColorPicker } from 'react-colorful';
import { z } from 'zod';

// Import a default theme

// Zod schema for pl-code attributes

// Common programming languages supported by highlight.js
const supportedLanguages = [
  'text',
  'javascript',
  'typescript',
  'python',
  'java',
  'cpp',
  'c',
  'csharp',
  'php',
  'ruby',
  'go',
  'rust',
  'swift',
  'kotlin',
  'scala',
  'r',
  'matlab',
  'sql',
  'html',
  'css',
  'scss',
  'less',
  'json',
  'xml',
  'yaml',
  'markdown',
  'bash',
  'powershell',
  'dockerfile',
  'nginx',
  'apache',
  'ini',
  'toml',
  'makefile',
  'cmake',
  'latex',
  'diff',
  'plaintext',
];

const PlCodeComponent = (props: ReactNodeViewProps<HTMLDivElement>) => {
  const [showOptionsModal, setShowOptionsModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [selectedLines, setSelectedLines] = useState<number[]>([]);
  const codeRef = useRef<HTMLPreElement>(null);
  const [highlightedContent, setHighlightedContent] = useState('');

  const attrs = { ...defaultAttrs, ...props.node.attrs } as PlCodeAttrs;
  const updateAttributes = props.updateAttributes as (attrs: Partial<PlCodeAttrs>) => void;

  // Get the text content from the node
  const getTextContent = () => {
    return props.node.textContent || '';
  };

  // Apply syntax highlighting
  const applySyntaxHighlighting = (content: string, language: string) => {
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

  // Copy code to clipboard
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(getTextContent());
    } catch (error) {
      console.error('Failed to copy code:', error);
    }
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
                {attrs.language}
              </Dropdown.Toggle>
              <Dropdown.Menu>
                {supportedLanguages.map((lang) => (
                  <Dropdown.Item
                    key={lang}
                    active={attrs.language === lang}
                    onClick={() => updateAttributes({ language: lang })}
                  >
                    {lang}
                  </Dropdown.Item>
                ))}
              </Dropdown.Menu>
            </Dropdown>
          </div>

          <div class="d-flex align-items-center gap-1">
            {attrs.copyCodeButton && (
              <OverlayTrigger placement="top" overlay={<Tooltip>Copy code</Tooltip>}>
                <Button variant="outline-secondary" size="sm" onClick={copyCode}>
                  <i class="bi bi-clipboard" />
                </Button>
              </OverlayTrigger>
            )}

            <OverlayTrigger placement="top" overlay={<Tooltip>Options</Tooltip>}>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowOptionsModal(true)}
              >
                <i class="bi bi-gear" />
              </Button>
            </OverlayTrigger>
          </div>
        </div>

        {/* Code content */}
        <div class="position-relative">
          <pre
            ref={codeRef}
            class={`hljs ${attrs.preventSelect ? 'user-select-none' : ''}`}
            style={{ margin: 0, padding: '1rem' }}
          >
            <code
              // eslint-disable-next-line @eslint-react/dom/no-dangerously-set-innerhtml
              dangerouslySetInnerHTML={{ __html: highlightedContent }}
              style={{
                userSelect: attrs.preventSelect ? 'none' : 'auto',
                pointerEvents: attrs.preventSelect ? 'none' : 'auto',
              }}
            />
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
              <Button variant="light" size="sm" onClick={() => setShowColorPicker(true)}>
                Choose Color
              </Button>
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

      {/* Options Modal */}
      <Modal show={showOptionsModal} onHide={() => setShowOptionsModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Code Block Options</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Check
              type="checkbox"
              id="preventSelect"
              label="Prevent text selection"
              checked={attrs.preventSelect}
              onChange={(e) => updateAttributes({ preventSelect: e.currentTarget.checked })}
            />
            <Form.Check
              type="checkbox"
              id="copyCodeButton"
              label="Show copy button"
              checked={attrs.copyCodeButton}
              onChange={(e) => updateAttributes({ copyCodeButton: e.currentTarget.checked })}
            />
            <Form.Check
              type="checkbox"
              id="showLineNumbers"
              label="Show line numbers"
              checked={attrs.showLineNumbers}
              onChange={(e) => updateAttributes({ showLineNumbers: e.currentTarget.checked })}
            />
          </Form>
        </Modal.Body>
      </Modal>

      {/* Color Picker Modal */}
      <Modal show={showColorPicker} onHide={() => setShowColorPicker(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Choose Highlight Color</Modal.Title>
        </Modal.Header>
        <Modal.Body class="d-flex justify-content-center">
          <HexColorPicker
            color={attrs.highlightLinesColor}
            onChange={(color) => updateAttributes({ highlightLinesColor: color })}
          />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowColorPicker(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>

      <NodeViewContent />
    </NodeViewWrapper>
  );
};

const PlCodeAttrsSchema = z.object({
  language: z.string().optional(),
  preventSelect: z.boolean().default(false),
  copyCodeButton: z.boolean().default(false),
  showLineNumbers: z.boolean().default(false),
  // Accepts input like 4, 1-3,5-10, and 1,2-5,20.
  highlightLines: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return [];
      return val.split(',').flatMap((part) => {
        const [start, end] = part.split('-');
        return Array.from(
          { length: Number.parseInt(end) - Number.parseInt(start) + 1 },
          (_, i) => Number.parseInt(start) + i,
        );
      });
    }),
  highlightLinesColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

type PlCodeAttrs = z.infer<typeof PlCodeAttrsSchema>;

export const PlCode = CodeBlock.extend({
  name: 'plCode',
  group: 'block',
  content: 'text*',
  marks: '',

  parseHTML() {
    return [
      {
        tag: 'pl-code',
        preserveWhitespace: 'full',
        getAttrs: (element: string | HTMLElement) => {
          if (typeof element === 'string') return false;

          const htmlElement = element;

          // Use Zod schema to validate and parse attributes
          try {
            const attrs = PlCodeAttrsSchema.parse(htmlElement.attributes);
            return attrs;
          } catch {
            // If parsing fails, mark as invalid element
            return {
              ...PlCodeAttrsSchema.parse({}),
              invalidElement: true,
            };
          }
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }: CodeBlockOptions) {
    return ['pl-code', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addAttributes() {
    const defaults = PlCodeAttrsSchema.parse({});
    return Object.fromEntries(
      Object.entries(defaults).map(([key, value]) => [key, { default: value }]),
    );
  },

  addNodeView() {
    return ReactNodeViewRenderer(PlCodeComponent);
  },
});
