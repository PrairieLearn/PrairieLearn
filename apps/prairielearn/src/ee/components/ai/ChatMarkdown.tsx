import clsx from 'clsx';
import { Fragment, type ReactNode, createElement } from 'react';
import type { UrlTransform } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import {
  type Components,
  type MathPlugin,
  Streamdown,
  defaultRehypePlugins,
  defaultRemarkPlugins,
} from 'streamdown';

import {
  escapeTableMathPipes,
  parseMarkdownIntoChatBlocks,
  remarkChatMath,
  remendHandlers,
} from './chatMath.js';

// Streamdown styles these tags with Tailwind utility classes, which are
// missing or mean something else in our Bootstrap app, so each is replaced
// with the plain tag.
const PLAIN_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'strong',
] as const;

// Table cells keep words whole, so paths and IDs get a line break opportunity
// after each slash.
function breakAfterSlashes(children: ReactNode) {
  if (typeof children !== 'string') return children;
  let offset = 0;
  return children.split(/(?<=\/)/).map((part) => {
    const start = offset;
    offset += part.length;
    return (
      <Fragment key={start}>
        {start > 0 && <wbr />}
        {part}
      </Fragment>
    );
  });
}

const components: Components = {
  ...Object.fromEntries(PLAIN_TAGS.map((tag) => [tag, tag])),
  inlineCode: ({ node: _node, className: _className, children, ...props }) => (
    <code {...props}>{breakAfterSlashes(children)}</code>
  ),
  // `pre` is left to Streamdown: it only marks its child as a block, and
  // `code` then renders the whole code block.
  code: ({ className, children }) => (
    <pre>
      <code className={className}>{children}</code>
    </pre>
  ),
  // Streamdown marks every link to open in a new tab. Course file links should
  // open in the same tab.
  a: ({ node: _node, className: _className, target: _target, rel: _rel, ...props }) =>
    createElement('a', props),
  img: ({ node: _node, className: _className, alt, ...props }) => (
    <img {...props} alt={alt ?? ''} className="img-fluid" />
  ),
  table: ({ node: _node, className: _className, ...props }) => (
    <div className="table-responsive mb-3">
      <table {...props} className="table table-sm table-bordered mb-0" />
    </div>
  ),
};

// Streamdown's default `raw` plugin is left out on purpose. It parses HTML in
// a message into elements, and sanitizing then silently drops any tag it
// doesn't know. Replies routinely mention elements like `<pl-number-input>`
// outside of code spans; without `raw`, HTML is shown as written instead.
const rehypePlugins = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden];

// Streamdown runs the math plugin's rehype step after the sanitizer, which
// would otherwise strip KaTeX's markup. KaTeX's defaults reject commands like
// `\href` and `\htmlClass` that would put links or classes from a reply into
// the page, and `maxSize` keeps `\rule` and the like from covering it.
const mathPlugins = {
  math: {
    name: 'katex',
    type: 'math',
    remarkPlugin: remarkChatMath,
    rehypePlugin: [rehypeKatex, { strict: 'ignore', maxSize: 10 }],
  } satisfies MathPlugin,
};

/**
 * Renders a chat reply's markdown. With `math`, TeX is typeset with KaTeX; the
 * page must then include KaTeX's stylesheet (see `courseAgent.css`).
 */
export function ChatMarkdown({
  content,
  streaming,
  math = false,
  className,
  urlTransform,
}: {
  content: string;
  streaming: boolean;
  math?: boolean;
  className?: string;
  urlTransform?: UrlTransform;
}) {
  return (
    <Streamdown
      // Question pages typeset the whole page with MathJax, which would read
      // prices like `$5 and $10` in a message as math.
      className={clsx(math && 'mathjax_ignore', className)}
      components={components}
      // Closing unfinished syntax would also rewrite finished messages, e.g.
      // dropping the `[` from a half-open interval like `[0, 1)`.
      parseIncompleteMarkdown={streaming}
      parseMarkdownIntoBlocksFn={math ? parseMarkdownIntoChatBlocks : undefined}
      plugins={math ? mathPlugins : undefined}
      rehypePlugins={rehypePlugins}
      remarkPlugins={Object.values(defaultRemarkPlugins)}
      // A link that is still streaming has no destination yet, so it is shown
      // as text until it is complete.
      remend={{
        linkMode: 'text-only',
        // `holdUnfinishedMath` holds back unfinished `$$` math instead.
        ...(math && { handlers: remendHandlers, katex: false }),
      }}
      urlTransform={urlTransform}
    >
      {math ? escapeTableMathPipes(content) : content}
    </Streamdown>
  );
}
