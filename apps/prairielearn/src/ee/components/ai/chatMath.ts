import type {
  CompileContext,
  Extension as FromMarkdownExtension,
  Token,
} from 'mdast-util-from-markdown';
import type {
  Code,
  Construct,
  Effects,
  Extension as MicromarkExtension,
  State,
} from 'micromark-util-types';
import remarkMath from 'remark-math';
// For the unified data that remark-parse reads extensions from.
import type {} from 'remark-parse';
import { type StreamdownProps, parseMarkdownIntoBlocks } from 'streamdown';
import type { Processor } from 'unified';

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    chatMath: 'chatMath';
    chatMathSequence: 'chatMathSequence';
    chatMathData: 'chatMathData';
    // remark-math's own block tokens, which `latexDisplayMath` reuses.
    mathFlow: 'mathFlow';
    mathFlowFence: 'mathFlowFence';
    mathFlowFenceSequence: 'mathFlowFenceSequence';
    mathFlowValue: 'mathFlowValue';
  }
}

const codes = {
  backslash: 92,
  dollar: 36,
  space: 32,
  underscore: 95,
  leftParen: 40,
  rightParen: 41,
  leftBracket: 91,
  rightBracket: 93,
};

// micromark uses negative codes for line endings, tabs, and virtual spaces.
function isLineEnding(code: Code) {
  return code !== null && code < -2;
}

function isWhitespace(code: Code) {
  return code !== null && (code < 0 || code === codes.space);
}

function isSpaceOrTab(code: Code) {
  return code === -2 || code === -1 || code === codes.space;
}

function isAlphanumeric(code: Code) {
  return (
    code !== null &&
    ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122))
  );
}

/**
 * Single-dollar math, using GitHub's rules to tell it apart from prices and
 * shell variables: the opening `$` doesn't follow a letter or digit and is
 * followed by a non-space, the math is on one line with no other `$` in it,
 * and the closing `$` follows a non-space and isn't followed by a letter,
 * digit, or `_`. So `$5 and $10` and `$HOME and $PATH` stay text, and `$x^2$`
 * is math.
 */
const dollarMath: Construct = {
  name: 'chatDollarMath',
  previous: (code) => code !== codes.dollar && !isAlphanumeric(code),
  tokenize(effects, ok, nok) {
    let afterSpace = false;

    return start;

    function start(code: Code): State | undefined {
      effects.enter('chatMath');
      effects.enter('chatMathSequence');
      effects.consume(code);
      effects.exit('chatMathSequence');
      return open;
    }

    function open(code: Code): State | undefined {
      if (code === null || code === codes.dollar || isWhitespace(code)) return nok(code);
      effects.enter('chatMathData');
      return data(code);
    }

    function data(code: Code): State | undefined {
      if (code === null || isLineEnding(code)) return nok(code);
      if (code === codes.dollar) {
        if (afterSpace) return nok(code);
        effects.exit('chatMathData');
        effects.enter('chatMathSequence');
        effects.consume(code);
        effects.exit('chatMathSequence');
        return close;
      }
      afterSpace = isSpaceOrTab(code);
      effects.consume(code);
      return code === codes.backslash ? escaped : data;
    }

    // Allows `\$` inside math.
    function escaped(code: Code): State | undefined {
      if (code !== codes.dollar) return data(code);
      effects.consume(code);
      return data;
    }

    function close(code: Code): State | undefined {
      if (code === codes.dollar || code === codes.underscore || isAlphanumeric(code)) {
        return nok(code);
      }
      effects.exit('chatMath');
      return ok(code);
    }
  },
};

const inlineClosing: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return (code: Code) => {
      effects.enter('chatMathSequence');
      effects.consume(code);
      return (code: Code) => {
        if (code !== codes.rightParen) return nok(code);
        effects.consume(code);
        effects.exit('chatMathSequence');
        return ok;
      };
    };
  },
};

/**
 * `\(...\)`, which models use more often than dollar signs. Markdown would
 * otherwise read it as escaped parentheses. Recognizing it while parsing,
 * rather than rewriting the markdown beforehand, leaves code alone.
 */
const latexInlineMath: Construct = {
  name: 'chatLatexInlineMath',
  tokenize(effects: Effects, ok, nok) {
    let hasData = false;

    return start;

    function start(code: Code): State | undefined {
      effects.enter('chatMath');
      effects.enter('chatMathSequence');
      effects.consume(code);
      return open;
    }

    function open(code: Code): State | undefined {
      if (code !== codes.leftParen) return nok(code);
      effects.consume(code);
      effects.exit('chatMathSequence');
      return between;
    }

    function between(code: Code): State | undefined {
      if (code === null) return nok(code);
      if (isLineEnding(code)) {
        effects.enter('lineEnding');
        effects.consume(code);
        effects.exit('lineEnding');
        return between;
      }
      if (code === codes.backslash) {
        return effects.attempt(inlineClosing, after, dataStart)(code);
      }
      return dataStart(code);
    }

    // Always consumes `code`, so a backslash that didn't close the math is
    // kept as data.
    function dataStart(code: Code): State | undefined {
      hasData = true;
      effects.enter('chatMathData');
      effects.consume(code);
      return code === codes.backslash ? escaped : data;
    }

    function data(code: Code): State | undefined {
      if (code === null || isLineEnding(code) || code === codes.backslash) {
        effects.exit('chatMathData');
        return between(code);
      }
      effects.consume(code);
      return data;
    }

    // Keeps TeX's `\\` together, so the second backslash can't start `\)`.
    function escaped(code: Code): State | undefined {
      if (code === null || isLineEnding(code)) return data(code);
      effects.consume(code);
      return data;
    }

    function after(code: Code): State | undefined {
      if (!hasData) return nok(code);
      effects.exit('chatMath');
      return ok(code);
    }
  },
};

/** Consumes up to `max` spaces or tabs as one `type` token, then goes to `next`. */
function spaces(
  effects: Effects,
  next: State,
  type: 'linePrefix' | 'whitespace',
  max = Infinity,
): State {
  let size = 0;
  return (code) => {
    if (!isSpaceOrTab(code)) return next(code);
    effects.enter(type);
    return inside(code);
  };

  function inside(code: Code): State | undefined {
    if (isSpaceOrTab(code) && size++ < max) {
      effects.consume(code);
      return inside;
    }
    effects.exit(type);
    return next(code);
  }
}

// Fails when the next line is a lazy continuation, e.g. in a block quote.
const nonLazyContinuation: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return (code) => {
      if (code === null) return ok(code);
      effects.enter('lineEnding');
      effects.consume(code);
      effects.exit('lineEnding');
      return (code) => (this.parser.lazy[this.now().line] ? nok(code) : ok(code));
    };
  },
};

// `\]`, then only spaces to the end of the line.
const displayClosingFence: Construct = {
  partial: true,
  tokenize(effects, ok, nok) {
    return start;

    function start(code: Code): State | undefined {
      effects.enter('mathFlowFence');
      effects.enter('mathFlowFenceSequence');
      effects.consume(code);
      return bracket;
    }

    function bracket(code: Code): State | undefined {
      if (code !== codes.rightBracket) return nok(code);
      effects.consume(code);
      effects.exit('mathFlowFenceSequence');
      return spaces(effects, end, 'whitespace');
    }

    function end(code: Code): State | undefined {
      if (code !== null && !isLineEnding(code)) return nok(code);
      effects.exit('mathFlowFence');
      return ok(code);
    }
  },
};

/**
 * Display math in `\[...\]`, either on one line of its own or with `\[` and
 * `\]` on lines of their own and the math between them. This has to be read
 * as a block, like a `$$` fence: otherwise a line of math such as `=` would
 * turn the lines above it into a heading. It emits remark-math's own token
 * types, so remark-math turns it into a display `math` node.
 *
 * Like Claude, `\[...\]` in the middle of a line stays text, and so does a
 * line that starts with `\[` but has no `\]`, such as `\[0, 1) is half-open`.
 * While a message streams, an unclosed block is held back by
 * `holdUnfinishedMath`.
 */
const latexDisplayMath: Construct = {
  name: 'chatLatexDisplayMath',
  concrete: true,
  tokenize(effects, ok, nok) {
    const tail = this.events.at(-1);
    const indent =
      tail?.[1].type === 'linePrefix' ? tail[2].sliceSerialize(tail[1], true).length : 0;

    return start;

    function start(code: Code): State | undefined {
      effects.enter('mathFlow');
      effects.enter('mathFlowFence');
      effects.enter('mathFlowFenceSequence');
      effects.consume(code);
      return bracket;
    }

    function bracket(code: Code): State | undefined {
      if (code !== codes.leftBracket) return nok(code);
      effects.consume(code);
      effects.exit('mathFlowFenceSequence');
      return spaces(effects, fenceEnd, 'whitespace');
    }

    function fenceEnd(code: Code): State | undefined {
      effects.exit('mathFlowFence');
      if (code === null) return nok(code);
      if (isLineEnding(code)) return nextLine(code);
      // `\[ x \]` on one line.
      effects.enter('mathFlowValue');
      return value(code, true);
    }

    function nextLine(code: Code): State | undefined {
      if (code === null) return nok(code);
      return effects.attempt(nonLazyContinuation, lineStart, nok)(code);
    }

    function lineStart(code: Code): State | undefined {
      return indent > 0
        ? spaces(effects, beforeValue, 'linePrefix', indent)(code)
        : spaces(effects, beforeValue, 'linePrefix', 3)(code);
    }

    function beforeValue(code: Code): State | undefined {
      if (code === null) return nok(code);
      if (isLineEnding(code)) return nextLine(code);
      if (code === codes.backslash) {
        return effects.attempt(displayClosingFence, after, startValue)(code);
      }
      return startValue(code);
    }

    function startValue(code: Code): State | undefined {
      effects.enter('mathFlowValue');
      return value(code, false);
    }

    // On the first line, the math must end with `\]` before the line does.
    function value(code: Code, firstLine: boolean): State | undefined {
      if (code === null || isLineEnding(code)) {
        effects.exit('mathFlowValue');
        return firstLine ? nok(code) : nextLine(code);
      }
      if (code === codes.backslash) {
        return effects.check(
          displayClosingFence,
          (code) => {
            effects.exit('mathFlowValue');
            return effects.attempt(displayClosingFence, after, nok)(code);
          },
          (code) => {
            effects.consume(code);
            return (code: Code) => {
              // Keep `\\` together, so the second backslash can't start `\]`.
              if (code !== null && !isLineEnding(code)) {
                effects.consume(code);
                return (code: Code) => value(code, firstLine);
              }
              return value(code, firstLine);
            };
          },
        )(code);
      }
      effects.consume(code);
      return (code: Code) => value(code, firstLine);
    }

    function after(code: Code): State | undefined {
      effects.exit('mathFlow');
      return ok(code);
    }
  },
};

const micromarkExtension: MicromarkExtension = {
  flow: { [codes.backslash]: latexDisplayMath },
  text: { [codes.dollar]: dollarMath, [codes.backslash]: latexInlineMath },
};

function enterMath(this: CompileContext, token: Token) {
  this.enter(
    {
      type: 'inlineMath',
      value: '',
      data: { hName: 'code', hProperties: { className: ['language-math', 'math-inline'] } },
    },
    token,
  );
  this.buffer();
}

function exitMath(this: CompileContext, token: Token) {
  const value = this.resume().trim();
  const node = this.stack.at(-1);
  if (node?.type !== 'inlineMath') throw new Error('Expected an inlineMath node');
  this.exit(token);
  node.value = value;
  node.data = { ...node.data, hChildren: [{ type: 'text', value }] };
}

function exitMathData(this: CompileContext, token: Token) {
  this.config.enter.data.call(this, token);
  this.config.exit.data.call(this, token);
}

const fromMarkdownExtension: FromMarkdownExtension = {
  canContainEols: ['inlineMath'],
  enter: { chatMath: enterMath },
  exit: { chatMath: exitMath, chatMathData: exitMathData },
};

/**
 * Parses the math that models write in chat replies: `$$...$$` (with
 * remark-math), `\(...\)`, `\[...\]`, and single-dollar math that isn't a
 * price.
 */
export function remarkChatMath(this: Processor) {
  remarkMath.call(this, { singleDollarTextMath: false });
  const data = this.data();
  (data.micromarkExtensions ??= []).push(micromarkExtension);
  (data.fromMarkdownExtensions ??= []).push(fromMarkdownExtension);
}

/**
 * GFM splits a table row into cells before reading math, so `\(|x|\)` in a
 * cell would be cut at its `|`. In table rows, `|` inside `\(...\)` or `$...$`
 * becomes `\vert{}`, which typesets the same.
 */
export function escapeTableMathPipes(markdown: string) {
  let inFence = false;
  return markdown
    .split('\n')
    .map((line) => {
      if (/^ {0,3}(?:```|~~~)/.test(line)) inFence = !inFence;
      if (inFence || !/^\s*\|/.test(line)) return line;
      return line.replaceAll(/\\\(.*?\\\)|(?<![\\$\w])\$(?=\S)[^$]*?\S\$(?![\w$])/g, (math) =>
        math.replaceAll(/(?<!\\)\|/g, '\\vert{}'),
      );
    })
    .join('\n');
}

type RemendHandler = NonNullable<NonNullable<StreamdownProps['remend']>['handlers']>[number];

// `\(...\)` or `\[...\]` within one paragraph.
const BODY = String.raw`(?:(?!\n[ \t]*\n)[\s\S])*?`;
const LATEX_MATH = new RegExp(String.raw`\\\[${BODY}\\\]|\\\(${BODY}\\\)`, 'g');
const PLACEHOLDER = /\uE000(\d+)\uE001/g;

// The math hidden by `hideLatexMath`. remend runs its handlers synchronously
// in order, so `restoreLatexMath` always reads what the same call stored.
let hiddenMath: string[] = [];

function inCode(text: string, index: number) {
  const before = text.slice(0, index);
  const fences = before.match(/^ {0,3}(?:```|~~~)/gm)?.length ?? 0;
  // A code span closes at the next run of the same number of backticks.
  let span: number | undefined;
  for (const [run] of before.slice(before.lastIndexOf('\n') + 1).matchAll(/`+/g)) {
    if (span === undefined) span = run.length;
    else if (run.length === span) span = undefined;
  }
  return fences % 2 === 1 || span !== undefined;
}

/** Where math that is still streaming starts at the end of `text`, if any. */
function unfinishedMathStart(text: string) {
  const starts: number[] = [];

  const display = [...text.matchAll(/^[ \t>]*\\\[[ \t]*$/gm)].at(-1);
  if (display && !/\\\][ \t]*$/m.test(text.slice(display.index))) starts.push(display.index);

  // A line that starts with `$$` and has an odd number of them opens or
  // closes a `$$` block. Elsewhere `$$` can appear in prose, so an unpaired
  // one only counts on the line still being written.
  let offset = 0;
  let open: number | undefined;
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    const count = line.match(/\$\$/g)?.length ?? 0;
    const fence = /^[ \t>]*\$\$/.test(line);
    if (count % 2 === 1 && (fence || index === lines.length - 1) && !inCode(text, offset)) {
      open = open === undefined ? offset + line.lastIndexOf('$$') : undefined;
    }
    offset += line.length + 1;
  }
  if (open !== undefined) starts.push(open);

  const inline = text.lastIndexOf('\\(');
  if (
    inline !== -1 &&
    text[inline - 1] !== '\\' &&
    !text.includes('\\)', inline) &&
    !/\n[ \t]*\n/.test(text.slice(inline))
  ) {
    starts.push(inline);
  }

  return starts.filter((start) => !inCode(text, start)).sort((a, b) => a - b)[0];
}

/**
 * Handlers for remend, which Streamdown uses to repair a message's unfinished
 * markdown while it streams.
 */
export const remendHandlers: RemendHandler[] = [
  {
    // Like ChatGPT, math that is still streaming is held back until it is
    // complete, rather than shown as TeX that keeps changing.
    name: 'holdUnfinishedMath',
    priority: -2,
    handle: (text) => text.slice(0, unfinishedMathStart(text)),
  },
  {
    // remend only knows to skip math inside `$$`. In `\(...\)` and `\[...\]`
    // it would read `[` as an unfinished link and remove it, and close the `_`
    // of `x_1` by adding `_` to the end of the message. So that math is
    // swapped for placeholders until the repair is done.
    name: 'hideLatexMath',
    priority: -1,
    handle: (text) => {
      hiddenMath = [];
      return text.replaceAll(LATEX_MATH, (math) => `\uE000${hiddenMath.push(math) - 1}\uE001`);
    },
  },
  {
    name: 'restoreLatexMath',
    priority: 1000,
    handle: (text) =>
      text.replaceAll(PLACEHOLDER, (match, index: string) => hiddenMath[Number(index)] ?? match),
  },
  {
    // A heading marker that is still streaming, such as the `#` of `## Next`,
    // would otherwise render as an empty heading for a moment.
    name: 'hideUnfinishedHeading',
    handle: (text) => text.replace(/(^|\n) {0,3}#{1,6}[ \t]*$/, '$1'),
  },
];

const DISPLAY_MATH_OPEN = /^ {0,3}\\\[[ \t]*$/;
const DISPLAY_MATH_CLOSE = /^ {0,3}\\\][ \t]*$/;

/**
 * Splits markdown into the blocks that Streamdown renders and memoizes
 * separately, keeping each `\[`...`\]` block in one piece. Streamdown's own
 * splitter would otherwise end a block at a math line such as `=`, which it
 * reads as a heading underline.
 */
export function parseMarkdownIntoChatBlocks(markdown: string) {
  const blocks: string[] = [];
  let open = false;
  for (const block of parseMarkdownIntoBlocks(markdown)) {
    if (open) {
      blocks[blocks.length - 1] += block;
    } else {
      blocks.push(block);
    }
    for (const line of block.split('\n')) {
      if (open ? DISPLAY_MATH_CLOSE.test(line) : DISPLAY_MATH_OPEN.test(line)) open = !open;
    }
  }
  return blocks;
}
