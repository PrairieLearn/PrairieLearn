import clsx from 'clsx';
import { filesize } from 'filesize';
import hljs from 'highlight.js/lib/core';
import hljsJson from 'highlight.js/lib/languages/json';
import hljsPython from 'highlight.js/lib/languages/python';
import hljsHtml from 'highlight.js/lib/languages/xml';
import { memo, useCallback, useMemo, useState } from 'react';
import { Card, Collapse, Form } from 'react-bootstrap';

hljs.registerLanguage('html', hljsHtml);
hljs.registerLanguage('json', hljsJson);
hljs.registerLanguage('python', hljsPython);

import {
  type CollisionStrategy,
  type QuestionOverrides,
  type SerializedConversionResult,
  type SerializedQuestionOutput,
  resolveRenamedDir,
} from '../instructorQtiImport.types.js';

const PL_ELEMENT_TYPE_MAP: Record<string, string> = {
  'pl-multiple-choice': 'Multiple choice',
  'pl-checkbox': 'Checkbox',
  'pl-matching': 'Matching',
  'pl-order-blocks': 'Ordering',
  'pl-number-input': 'Numeric',
  'pl-integer-input': 'Integer',
  'pl-string-input': 'Short answer',
  'pl-dropdown': 'Dropdown',
  'pl-rich-text-editor': 'Essay',
  'pl-file-upload': 'File upload',
};

function formatGradingMethod(method: string | undefined): string {
  switch (method) {
    case 'Manual':
      return 'Manually graded';
    case 'External':
      return 'Externally graded';
    default:
      return 'Automatically graded';
  }
}

function detectQuestionType(html: string): string {
  for (const [element, label] of Object.entries(PL_ELEMENT_TYPE_MAP)) {
    if (html.includes(`<${element}`)) return label;
  }
  if (html.includes('<pl-question-panel>') && !/<pl-(?!question-panel|answer-panel)/.test(html)) {
    return 'Text only';
  }
  return 'Unknown';
}

interface ExpansionCommand {
  version: number;
  expanded: boolean;
}

function QuestionReviewPanelImpl({
  question: q,
  questionNumber,
  warnings,
  overrides: qo,
  existingDirs,
  expansionCommand,
  onUpdateOverride,
}: {
  question: SerializedQuestionOutput;
  questionNumber: number;
  warnings: SerializedConversionResult['warnings'];
  overrides: QuestionOverrides | undefined;
  existingDirs: Set<string>;
  expansionCommand: ExpansionCommand;
  onUpdateOverride: (dirName: string, updates: Partial<QuestionOverrides>) => void;
}) {
  const [localExpansion, setLocalExpansion] = useState({ version: 0, expanded: false });
  const [selectedFile, setSelectedFile] = useState<string | null>('question.html');
  const [rawTags, setRawTags] = useState<string | null>(null);
  const questionType = useMemo(() => detectQuestionType(q.questionHtml), [q.questionHtml]);
  const included = qo?.included ?? true;
  const isExpanded =
    localExpansion.version === expansionCommand.version
      ? localExpansion.expanded
      : expansionCommand.expanded;
  const title = qo?.title ?? q.infoJson.title;
  const tags = qo?.tags ?? q.infoJson.tags;

  const updateOverride = useCallback(
    (updates: Partial<QuestionOverrides>) => onUpdateOverride(q.directoryName, updates),
    [onUpdateOverride, q.directoryName],
  );
  const toggleExpanded = useCallback(
    () =>
      setLocalExpansion({
        version: expansionCommand.version,
        expanded: !isExpanded,
      }),
    [expansionCommand.version, isExpanded],
  );

  const mergedInfoJson = useMemo(
    () => ({
      ...q.infoJson,
      ...(qo && {
        title: qo.title,
        topic: qo.topic,
        tags: qo.tags,
      }),
    }),
    [q.infoJson, qo],
  );

  const fileEntries = useMemo(() => {
    const entries: { name: string; path: string; content: string; icon: string }[] = [
      {
        name: 'info.json',
        path: 'info.json',
        content: JSON.stringify(mergedInfoJson, null, 2),
        icon: 'bi-file-earmark-code',
      },
      {
        name: 'question.html',
        path: 'question.html',
        content: q.questionHtml,
        icon: 'bi-filetype-html',
      },
    ];
    if (q.serverPy) {
      entries.push({
        name: 'server.py',
        path: 'server.py',
        content: q.serverPy,
        icon: 'bi-filetype-py',
      });
    }
    for (const name of Object.keys(q.clientFiles)) {
      entries.push({
        name,
        path: `clientFilesQuestion/${name}`,
        content: `(binary file - ${filesize(q.clientFiles[name].size, { round: 0 })})`,
        icon: 'bi-file-earmark-image',
      });
    }
    return entries;
  }, [mergedInfoJson, q.clientFiles, q.questionHtml, q.serverPy]);

  const selectedContent = useMemo(
    () => fileEntries.find((f) => f.path === selectedFile)?.content ?? null,
    [fileEntries, selectedFile],
  );
  const selectFile = useCallback(
    (path: string) => setSelectedFile(path === selectedFile ? null : path),
    [selectedFile],
  );

  return (
    <Card className={clsx(!included && 'opacity-50')}>
      <Card.Header className="d-flex align-items-center gap-2 py-2">
        <Form.Check
          id={`q-include-${q.directoryName}`}
          checked={included}
          label=""
          aria-label={`Include question ${questionNumber}: ${title}`}
          onChange={(e) => updateOverride({ included: e.target.checked })}
          onClick={(e) => e.stopPropagation()}
        />
        <div
          className="d-flex align-items-center gap-2 flex-grow-1"
          style={{ cursor: 'pointer' }}
          role="button"
          aria-expanded={isExpanded}
          aria-controls={`q-panel-${q.directoryName}`}
          tabIndex={0}
          onClick={toggleExpanded}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              toggleExpanded();
            }
          }}
        >
          <i
            className={clsx('bi', isExpanded ? 'bi-chevron-down' : 'bi-chevron-right')}
            aria-hidden="true"
          />
          <span className="text-muted">{questionNumber}.</span>
          <span className="fw-medium">{title}</span>
          {q.skippedVideos.length > 0 && (
            <i
              className="bi bi-exclamation-triangle-fill text-danger flex-grow-1"
              aria-label={`${q.skippedVideos.length} video file${q.skippedVideos.length !== 1 ? 's' : ''} excluded`}
              title={`${q.skippedVideos.length} video file${q.skippedVideos.length !== 1 ? 's' : ''} excluded`}
            />
          )}
          {warnings.length > 0 && (
            <i
              className="bi bi-exclamation-triangle-fill text-warning flex-grow-1"
              aria-label={`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`}
              title={`${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`}
            />
          )}
        </div>
        <span className="badge color-blue3">{questionType}</span>
        {tags.map((tag) => (
          <span key={tag} className="badge color-gray2">
            {tag}
          </span>
        ))}
      </Card.Header>
      {qo?.collides && included && (
        <div className="px-3 py-2 bg-light border-bottom d-flex align-items-center gap-2 small">
          <i className="bi bi-exclamation-circle text-warning" aria-hidden="true" />
          <span>
            Conflicts with existing question <code>{qo.originalDirName}</code>
          </span>
          <Form.Select
            size="sm"
            style={{ width: 'auto' }}
            value={qo.collisionStrategy}
            disabled={!included}
            onChange={(e) =>
              updateOverride({ collisionStrategy: e.target.value as CollisionStrategy })
            }
            onClick={(e) => e.stopPropagation()}
          >
            <option value="overwrite">Replace existing question</option>
            <option value="rename">Keep both</option>
          </Form.Select>
          {qo.collisionStrategy === 'rename' && (
            <code className="text-muted">
              {qo.originalDirName} &rarr; {resolveRenamedDir(qo.originalDirName, existingDirs)}
            </code>
          )}
        </div>
      )}
      <Collapse in={isExpanded && included}>
        <div id={`q-panel-${q.directoryName}`}>
          <Card.Body className="p-0">
            {warnings.length > 0 && (
              <div className="px-3 py-2 border-bottom bg-light d-flex align-items-start gap-2 small">
                <i
                  className="bi bi-exclamation-triangle-fill text-warning mt-1"
                  aria-hidden="true"
                />
                <div>
                  <strong>Warnings:</strong>
                  <ul className="mb-0 mt-1">
                    {warnings.map((warning) => (
                      <li key={warning.message} className="text-muted">
                        {warning.message}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
            <div className="d-flex flex-wrap" style={{ minHeight: '280px' }}>
              {/* Column 1: Question info & editing */}
              <div
                className="p-3 border-end border-bottom border-bottom-md-0"
                style={{ flex: '0 0 300px' }}
              >
                <div className="mb-3">
                  <Form.Label
                    htmlFor={`q-title-${q.directoryName}`}
                    className="small text-muted mb-1"
                  >
                    Title
                  </Form.Label>
                  <Form.Control
                    id={`q-title-${q.directoryName}`}
                    size="sm"
                    type="text"
                    value={qo?.title ?? ''}
                    onChange={(e) => updateOverride({ title: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <Form.Label
                    htmlFor={`q-topic-${q.directoryName}`}
                    className="small text-muted mb-1"
                  >
                    Topic
                  </Form.Label>
                  <Form.Control
                    id={`q-topic-${q.directoryName}`}
                    size="sm"
                    type="text"
                    value={qo?.topic ?? ''}
                    onChange={(e) => updateOverride({ topic: e.target.value })}
                  />
                </div>
                <div className="mb-3">
                  <Form.Label
                    htmlFor={`q-tags-${q.directoryName}`}
                    className="small text-muted mb-1"
                  >
                    Tags (comma-separated)
                  </Form.Label>
                  <Form.Control
                    id={`q-tags-${q.directoryName}`}
                    size="sm"
                    type="text"
                    value={rawTags ?? qo?.tags.join(', ') ?? ''}
                    onChange={(e) => setRawTags(e.target.value)}
                    onBlur={() => {
                      if (rawTags !== null) {
                        updateOverride({
                          tags: rawTags
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean),
                        });
                        setRawTags(null);
                      }
                    }}
                  />
                </div>
                <div>
                  <div className="small text-muted mb-1">Grading</div>
                  <div>{formatGradingMethod(q.infoJson.gradingMethod)}</div>
                </div>
              </div>

              {/* Columns 2+3: File tree and viewer (stay together) */}
              <div className="d-flex flex-grow-1" style={{ minWidth: '0', flex: '2 1 400px' }}>
                {/* Column 2: File tree */}
                <div
                  className="p-3 border-end small d-flex flex-column"
                  style={{ width: '300px', flexShrink: 0 }}
                >
                  <FileTree
                    rootLabel={`${q.directoryName}/`}
                    entries={fileEntries}
                    selectedFile={selectedFile}
                    onSelectFile={selectFile}
                  />
                </div>

                {/* Column 3: File content viewer */}
                <div className="flex-grow-1 overflow-hidden">
                  {selectedFile && selectedContent ? (
                    <CodeViewer content={selectedContent} filename={selectedFile} />
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-100 text-muted">
                      Select a file to view its contents
                    </div>
                  )}
                </div>
              </div>
            </div>
            {q.skippedVideos.length > 0 && (
              <div className="px-3 py-2 border-top bg-light d-flex align-items-start gap-2 small">
                <i
                  className="bi bi-exclamation-triangle-fill text-danger mt-1"
                  aria-hidden="true"
                />
                <div>
                  <strong>
                    {q.skippedVideos.length} video file
                    {q.skippedVideos.length !== 1 ? 's' : ''} excluded:
                  </strong>
                  <ul className="mb-0 mt-1">
                    {q.skippedVideos.map((name) => (
                      <li key={name} className="text-muted">
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </Card.Body>
        </div>
      </Collapse>
    </Card>
  );
}

export const QuestionReviewPanel = memo(QuestionReviewPanelImpl);
QuestionReviewPanel.displayName = 'QuestionReviewPanel';

const FILENAME_LANGUAGE_MAP: Record<string, string> = {
  '.json': 'json',
  '.html': 'html',
  '.py': 'python',
};

/** TODO: potentially bolster this with usage of hljs's checker */
function detectLanguage(filename: string): string | undefined {
  for (const [ext, lang] of Object.entries(FILENAME_LANGUAGE_MAP)) {
    if (filename.endsWith(ext)) return lang;
  }
  return undefined;
}

function CodeViewer({ content, filename }: { content: string; filename: string }) {
  const highlighted = useMemo(() => {
    const language = detectLanguage(filename);
    if (language) {
      return hljs.highlight(content, { language }).value;
    }
    return null;
  }, [content, filename]);

  return (
    <pre
      className="m-0 p-3 h-100 small hljs"
      style={{
        overflow: 'auto',
        maxHeight: '400px',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {highlighted ? (
        // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- Rendering highlight.js output
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
      ) : (
        <code>{content}</code>
      )}
    </pre>
  );
}

interface TreeNode {
  name: string;
  path?: string;
  icon?: string;
  children?: TreeNode[];
}

function buildTree(entries: { name: string; path: string; icon: string }[]): TreeNode[] {
  const root: TreeNode[] = [];

  const rootFiles = entries.filter((e) => !e.path.includes('/'));
  const nested = entries.filter((e) => e.path.includes('/'));

  for (const f of rootFiles) {
    root.push({ name: f.name, path: f.path, icon: f.icon });
  }

  const dirs = new Map<string, typeof nested>();
  for (const f of nested) {
    const slashIdx = f.path.indexOf('/');
    const dirName = f.path.slice(0, slashIdx);
    const group = dirs.get(dirName) ?? [];
    group.push(f);
    dirs.set(dirName, group);
  }

  for (const [dirName, files] of dirs) {
    const dirNode: TreeNode = {
      name: `${dirName}/`,
      icon: 'bi-folder',
      children: [],
    };

    const subDirs = new Map<string, typeof files>();
    const directFiles: typeof files = [];

    for (const f of files) {
      const rest = f.path.slice(dirName.length + 1);
      const subSlash = rest.indexOf('/');
      if (subSlash === -1) {
        directFiles.push(f);
      } else {
        const subDirName = rest.slice(0, subSlash);
        const group = subDirs.get(subDirName) ?? [];
        group.push(f);
        subDirs.set(subDirName, group);
      }
    }

    for (const [subDirName, subFiles] of subDirs) {
      dirNode.children!.push({
        name: `${subDirName}/`,
        icon: 'bi-folder',
        children: subFiles.map((f) => ({
          name: f.path.slice(f.path.lastIndexOf('/') + 1),
          path: f.path,
          icon: f.icon,
        })),
      });
    }

    for (const f of directFiles) {
      dirNode.children!.push({
        name: f.path.slice(f.path.lastIndexOf('/') + 1),
        path: f.path,
        icon: f.icon,
      });
    }

    root.push(dirNode);
  }

  return root;
}

function FileTree({
  rootLabel,
  entries,
  selectedFile,
  onSelectFile,
}: {
  rootLabel: string;
  entries: { name: string; path: string; content: string; icon: string }[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  const tree = useMemo(() => buildTree(entries), [entries]);

  return (
    <>
      <div className="text-muted mb-2 font-monospace">
        <i className="bi bi-folder-fill me-1" aria-hidden="true" />
        {rootLabel}
      </div>
      <div className="font-monospace">
        <TreeNodes nodes={tree} depth={0} selectedFile={selectedFile} onSelectFile={onSelectFile} />
      </div>
      <div className="text-muted small px-2 mt-auto">
        You'll be able to edit question files once they've been imported.
      </div>
    </>
  );
}

function TreeNodes({
  nodes,
  depth,
  selectedFile,
  onSelectFile,
}: {
  nodes: TreeNode[];
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path ?? node.name}>
          {node.path ? (
            <div
              className={clsx(
                'px-2 py-1 rounded d-flex align-items-center gap-1',
                selectedFile === node.path ? 'bg-primary text-white' : 'text-body',
              )}
              style={{ cursor: 'pointer', marginLeft: `${depth * 16}px` }}
              role="button"
              tabIndex={0}
              onClick={() => onSelectFile(node.path!)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectFile(node.path!);
                }
              }}
            >
              <i className={`bi ${node.icon ?? 'bi-file-earmark'}`} aria-hidden="true" />
              <span className="text-truncate">{node.name}</span>
            </div>
          ) : (
            <div
              className="px-2 py-1 text-muted d-flex align-items-center gap-1"
              style={{ marginLeft: `${depth * 16}px` }}
            >
              <i className={`bi ${node.icon ?? 'bi-folder'}`} aria-hidden="true" />
              {node.name}
            </div>
          )}
          {node.children && (
            <TreeNodes
              nodes={node.children}
              depth={depth + 1}
              selectedFile={selectedFile}
              onSelectFile={onSelectFile}
            />
          )}
        </div>
      ))}
    </>
  );
}
