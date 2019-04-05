const markdown = require('../lib/markdown');
const assert = require('chai').assert;

describe('Markdown processing', () => {
    it('renders basic markdown correctly', () => {
        const question = '<markdown>\n# Hello, world!\nThis **works**.\n</markdown>';
        const expected = '<h1>Hello, world!</h1>\n<p>This <strong>works</strong>.</p>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('strips <p> tags if necessary', () => {
        const question = '<markdown>This is **inline**.</markdown>';
        const expected = 'This is <strong>inline</strong>.';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it ('handles multiple <markdown> tags', () => {
        const question = '<markdown>`nice`</markdown><markdown>`also nice`</markdown>';
        const expected = '<code>nice</code><code>also nice</code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('handles code blocks', () => {
        const question = '<markdown>\n```\nint a = 12;\n```\n</markdown>';
        const expected = '<pl-code no-highlight="true">int a = 12;</pl-code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('handles code blocks with language', () => {
        const question = '<markdown>\n```cpp\nint a = 12;\n```\n</markdown>';
        const expected = '<pl-code language="cpp">int a = 12;</pl-code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('handles code blocks with highlighted lines', () => {
        const question = '<markdown>\n```{1,2-3}\nint a = 12;\n```\n</markdown>';
        const expected = '<pl-code no-highlight="true" highlight-lines="1,2-3">int a = 12;</pl-code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('handles code blocks with language and highlighted lines', () => {
        const question = '<markdown>\n```cpp{1,2-3}\nint a = 12;\n```\n</markdown>';
        const expected = '<pl-code language="cpp" highlight-lines="1,2-3">int a = 12;</pl-code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('handles escaped <markdown> tags', () => {
        const question = '<markdown>```html\n<markdown#></markdown#>\n```</markdown>';
        const expected = '<pl-code language="html">&#x3C;markdown>&#x3C;/markdown></pl-code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });

    it('handles weird escaped <markdown> tags', () => {
        const question = '<markdown>```html\n<markdown###></markdown###>\n```</markdown>';
        const expected = '<pl-code language="html">&#x3C;markdown##>&#x3C;/markdown##></pl-code>';
        const actual = markdown.processQuestion(question);
        assert.equal(actual, expected);
    });
});
