const unified = require('unified');
const markdown = require('remark-parse');
const raw = require('rehype-raw');
const remark2rehype = require('remark-rehype');
const stringify = require('rehype-stringify');
const visit = require('unist-util-visit');

const regex = /<markdown>(.+?)<\/markdown>/gms;
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
            } else {
                attrs.push('no-highlight="true"');
            }
            if (highlightLines) {
                attrs.push(`highlight-lines="${highlightLines}"`);
            }
        }

        value = value.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
    
        const html = {
            type: 'html',
            value: `<pl-code ${attrs.join(' ')}>${value}</pl-code>`,
        };
    
        parent.children.splice(index, 1, html);
    
        return node;
    });
};

const handleCode = () => {
    return function transformer(ast, vFile, next) {
        visitCodeBlock(ast, vFile);
    
        if (typeof next === 'function') {
            return next(null, ast, vFile);
        }
    
        return ast;
    };
};

const processor = unified()
    .use(markdown)
    .use(handleCode)
    .use(remark2rehype, { allowDangerousHTML: true })
    .use(raw)
    .use(stringify);

module.exports.processQuestion = function(html) {
    return html.replace(regex, (_match, originalContents) => {
        let res = processor.processSync(originalContents);
        // By default, all text + inline code gets wrapped with <p>. However, it might be used in
        // an "inline" fashion, like <pl-answer><markdown>**Hi**</markdown></pl-answer>.
        // In that case, we want to remove those <p> tags. Our heuristic is that if
        // a) the rendered HTML starts with "<p>""
        // b) the rendered HTML contains only one "<p>"
        // c) the rendered HTML ends with "</p>"
        // ...then we'll remove the tags. Otherwise, we'll play it safe and leave it alone.
        let { contents } = res;
        const startsWith = contents.startsWith('<p>');
        const hasAnother = contents.lastIndexOf('<p>') !== 0;
        const endsWith = contents.endsWith('</p>');
        if (startsWith && !hasAnother && endsWith) {
            contents = contents.substring(3, contents.length - 4);
        }
        return contents;
    });
};
