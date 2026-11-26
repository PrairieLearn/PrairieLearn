import clsx from 'clsx';
import {
  type CSSProperties,
  type ReactElement,
  createElement,
  isValidElement,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { UrlTransform } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import {
  type AnimateOptions,
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

const components: Components = {
  ...Object.fromEntries(PLAIN_TAGS.map((tag) => [tag, tag])),
  // Streamdown fades in the words inside a code span but not the span's own background, which
  // would show as an empty chip before its words. The chip fades in with its first word.
  inlineCode: ({ node: _node, className: _className, ...props }) => {
    const word = [props.children]
      .flat()
      .find(
        (child): child is ReactElement<{ style?: CSSProperties; 'data-sd-animate'?: boolean }> =>
          isValidElement<{ 'data-sd-animate'?: boolean }>(child) &&
          !!child.props['data-sd-animate'],
      );
    if (!word) return <code {...props} />;
    return <code {...props} style={word.props.style} data-sd-animate />;
  },
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
 * Words fade in one after another as they arrive, so a streaming reply reads as flowing in, not
 * jumping.
 */
const STREAM_ANIMATION = {
  animation: 'fadeIn',
  duration: 400,
  easing: 'ease-out',
  sep: 'word',
} satisfies AnimateOptions;

/** The longest Streamdown makes a word wait to start fading in, plus the fade itself. */
const FADE_TAIL_MS = 320 + STREAM_ANIMATION.duration;

/**
 * Keeps words fading for a moment after the text stops streaming. Streamdown drops the fade as
 * soon as it is told the text is done, which would show a short reply's half-faded words at once.
 * Text that first shows while its reply is arriving fades in too, even if it came in one piece.
 */
function useFading(streaming: boolean, arriving: boolean) {
  const [fading, setFading] = useState(streaming || arriving);
  if (streaming && !fading) setFading(true);
  // Ends the fade once the last words have had time to finish.
  useEffect(() => {
    if (streaming || !fading) return;
    const timeout = setTimeout(() => setFading(false), FADE_TAIL_MS);
    return () => clearTimeout(timeout);
  }, [streaming, fading]);
  return fading;
}

/**
 * Renders a chat reply's markdown. With `math`, TeX is typeset with KaTeX; the
 * page must then include KaTeX's stylesheet (see `courseAgent.css`). With
 * `animated`, text fades in as it streams; the page must then include
 * Streamdown's stylesheet.
 */
export function ChatMarkdown({
  content,
  streaming,
  arriving = false,
  math = false,
  animated = false,
  className,
  urlTransform,
  codeBlock,
}: {
  content: string;
  streaming: boolean;
  /** The reply is coming in now, so with `animated`, its text fades in even if it is complete. */
  arriving?: boolean;
  math?: boolean;
  animated?: boolean;
  className?: string;
  urlTransform?: UrlTransform;
  /** Renders fenced code blocks, in place of a plain `<pre>`. */
  codeBlock?: Components['code'];
}) {
  const fading = useFading(streaming, arriving);
  // Streamdown renders every block again when it is given a new `components` object.
  const allComponents = useMemo(
    () => (codeBlock ? { ...components, code: codeBlock } : components),
    [codeBlock],
  );
  return (
    <Streamdown
      animated={animated && STREAM_ANIMATION}
      // Question pages typeset the whole page with MathJax, which would read
      // prices like `$5 and $10` in a message as math.
      className={clsx(math && 'mathjax_ignore', className)}
      components={allComponents}
      // Streamdown's own streaming behavior, such as `useIsCodeFenceIncomplete`, keys off this.
      // With `animated`, it also keeps the fade going until the last words have finished.
      isAnimating={animated ? fading : streaming}
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
