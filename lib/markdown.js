const unified = require('unified');
const markdown = require('remark-parse');
const raw = require('rehype-raw');
const gfm = require('remark-gfm');
const remark2rehype = require('remark-rehype');
const math = require('remark-math');
const stringify = require('rehype-stringify');
const sanitize = require('rehype-sanitize');
const visit = require('unist-util-visit');

const regex = /<markdown>(.+?)<\/markdown>/gms;
const escapeRegex = /(<\/?markdown)(#+)>/g;
const langRegex = /([^\\{]*)?(\{(.*)\})?/;

const visitCodeBlock = (ast, _vFile) => {
  return visit(ast, 'code', (node, index, parent) => {
    let { lang, value } = node;
    const attrs = [];

    if (lang) {
      const res = lang.match(langRegex);
      const language = res[1];
      const highlightLines = res[3];
      if (language) {
        attrs.push(`language="${language}"`);
      }
      if (highlightLines) {
        attrs.push(`highlight-lines="${highlightLines}"`);
      }
    }

    value = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const html = {
      type: 'html',
      value: `<pl-code ${attrs.join(' ')}>${value}</pl-code>`,
    };

    parent.children.splice(index, 1, html);

    return node;
  });
};

/**
 * By default, `remark-math` installs compilers to transform the AST back into
 * HTML, which ends up wrapping the math in unwanted spans and divs. Since all
 * math will be rendered on the client, we have our own visitor that will replace
 * any `math` or `inlineMath` nodes with raw text values wrapped in the appropriate
 * fences.
 */
const visitMathBlock = (ast, _vFile) => {
  return visit(ast, ['math', 'inlineMath'], (node, index, parent) => {
    const startFence = node.type === 'math' ? '$$\n' : '$';
    const endFence = node.type === 'math' ? '\n$$' : '$';
    const text = {
      type: 'text',
      value: startFence + node.value + endFence,
    };
    parent.children.splice(index, 1, text);
    return node;
  });
};

const makeHandler = (visitor) => {
  return () => (ast, vFile, next) => {
    visitor(ast, vFile);

    if (typeof next === 'function') {
      return next(null, ast, vFile);
    }
    return ast;
  };
};

const handleCode = makeHandler(visitCodeBlock);
const handleMath = makeHandler(visitMathBlock);

const defaultProcessor = unified()
  .use(markdown)
  .use(math)
  .use(handleMath)
  .use(gfm)
  .use(remark2rehype, { allowDangerousHtml: true })
  .use(raw)
  .use(sanitize)
  .use(stringify);

// The question processor also includes the use of pl-code instead of pre,
// and does not sanitize scripts
const questionProcessor = unified()
  .use(markdown)
  .use(math)
  .use(handleCode)
  .use(handleMath)
  .use(gfm)
  .use(remark2rehype, { allowDangerousHtml: true })
  .use(raw)
  .use(stringify);

module.exports.processQuestion = function (html) {
  return html.replace(regex, (_match, originalContents) => {
    // We'll handle escapes before we pass off the string to our Markdown pipeline
    const decodedContents = originalContents.replace(escapeRegex, (match, prefix, hashes) => {
      return `${prefix}${'#'.repeat(hashes.length - 1)}>`;
    });
    const res = questionProcessor.processSync(decodedContents);
    return res.contents;
  });
};

module.exports.processContent = async function (original) {
  return (await defaultProcessor.process(original)).contents;
};
