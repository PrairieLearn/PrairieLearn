const unified = require('unified');
const markdown = require('remark-parse');
const raw = require('rehype-raw');
const remark2rehype = require('remark-rehype');
const stringify = require('rehype-stringify');
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
            } else {
                attrs.push('no-highlight="true"');
            }
            if (highlightLines) {
                attrs.push(`highlight-lines="${highlightLines}"`);
            }
        } else {
            attrs.push('no-highlight="true"');
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
        // We'll handle escapes before we pass off the string to our Markdown pipeline
        const decodedContents = originalContents.replace(escapeRegex, (match, prefix, hashes) => {
            return `${prefix}${'#'.repeat(hashes.length - 1)}>`;
        });
        const res = processor.processSync(decodedContents);
        return res.contents;
    });
};
