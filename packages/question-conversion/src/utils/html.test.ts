import { assert, describe, it } from 'vitest';

import {
  cleanQuestionHtml,
  convertLatexItemizeToMarkdown,
  extractInlineImages,
  resolveImsFileRefs,
  rewriteImagesAsPlFigure,
  rewritePreAsPlCode,
  unescapeHtml,
} from './html.js';

describe('unescapeHtml', () => {
  it('unescapes common HTML entities', () => {
    assert.equal(unescapeHtml('&lt;p&gt;hello &amp; world&lt;/p&gt;'), '<p>hello & world</p>');
  });

  it('unescapes quotes', () => {
    assert.equal(unescapeHtml('&quot;test&#39;s&quot;'), '"test\'s"');
  });

  it('unescapes nbsp', () => {
    assert.equal(unescapeHtml('foo&nbsp;bar'), 'foo\u00A0bar');
  });
});

describe('extractInlineImages', () => {
  it('replaces data URI with file reference', () => {
    // 1x1 red PNG as base64
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const html = `<img src="data:image/png;base64,${b64}">`;
    const result = extractInlineImages(html);

    assert.equal(result.files.size, 1);
    const [filename] = [...result.files.keys()];
    assert.match(filename, /^inline-[0-9a-f]{16}\.png$/);
    assert.equal(result.html, `<img src="clientFilesQuestion/${filename}">`);
  });

  it('returns unchanged HTML when no data URIs', () => {
    const html = '<img src="image.png">';
    const result = extractInlineImages(html);
    assert.equal(result.html, html);
    assert.equal(result.files.size, 0);
  });

  it('deduplicates identical images', () => {
    const b64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const html = `<img src="data:image/png;base64,${b64}"><img src="data:image/png;base64,${b64}">`;
    const result = extractInlineImages(html);
    assert.equal(result.files.size, 1);
  });
});

describe('rewriteImagesAsPlFigure', () => {
  it('converts a plain img to pl-figure', () => {
    assert.equal(
      rewriteImagesAsPlFigure('<img src="test.png">'),
      '<pl-figure file-name="test.png"></pl-figure>',
    );
  });

  it('strips clientFilesQuestion/ prefix and sets directory attribute', () => {
    assert.equal(
      rewriteImagesAsPlFigure('<img src="clientFilesQuestion/image.png">'),
      '<pl-figure file-name="image.png" directory="clientFilesQuestion"></pl-figure>',
    );
  });

  it('preserves alt and width attributes, drops height', () => {
    assert.equal(
      rewriteImagesAsPlFigure(
        '<img src="clientFilesQuestion/img.png" alt="A diagram" width="300" height="200">',
      ),
      '<pl-figure file-name="img.png" directory="clientFilesQuestion" alt="A diagram" width="300"></pl-figure>',
    );
  });

  it('drops style and class attributes', () => {
    const result = rewriteImagesAsPlFigure(
      '<img src="test.png" style="max-width:100%" class="foo">',
    );
    assert.notInclude(result, 'style=');
    assert.notInclude(result, 'class=');
    assert.include(result, '<pl-figure');
  });

  it('handles external URLs without directory attribute', () => {
    assert.equal(
      rewriteImagesAsPlFigure('<img src="https://example.com/img.png" alt="external">'),
      '<pl-figure file-name="https://example.com/img.png" alt="external"></pl-figure>',
    );
  });

  it('passes through HTML with no img tags unchanged', () => {
    const html = '<p>No images here</p>';
    assert.equal(rewriteImagesAsPlFigure(html), html);
  });
});

describe('resolveImsFileRefs', () => {
  it('rewrites $IMS-CC-FILEBASE$ to clientFilesQuestion path', () => {
    const html = '<img src="$IMS-CC-FILEBASE$/Quiz%20Files/image.png">';
    const result = resolveImsFileRefs(html);
    assert.equal(result.html, '<img src="clientFilesQuestion/image.png">');
    assert.equal(result.fileRefs.get('image.png'), 'Quiz Files/image.png');
  });
});

describe('convertLatexItemizeToMarkdown', () => {
  it('converts a simple itemize block to markdown bullets', () => {
    const html = 'Before \\begin{itemize}\\item First\\item Second\\item Third\\end{itemize} After';
    assert.equal(
      convertLatexItemizeToMarkdown(html),
      'Before <markdown>\n- First\n- Second\n- Third\n</markdown> After',
    );
  });

  it('handles optional label in \\item[label]', () => {
    const html = '\\begin{itemize}\\item[a] Apple\\item[b] Banana\\end{itemize}';
    assert.equal(convertLatexItemizeToMarkdown(html), '<markdown>\n- Apple\n- Banana\n</markdown>');
  });

  it('returns empty markdown block for itemize with no items', () => {
    const html = '\\begin{itemize}\\end{itemize}';
    const result = convertLatexItemizeToMarkdown(html);
    assert.equal(result, '<markdown>\n</markdown>');
  });

  it('passes through HTML with no LaTeX itemize unchanged', () => {
    const html = '<p>No LaTeX here</p>';
    assert.equal(convertLatexItemizeToMarkdown(html), html);
  });

  it('collapses internal whitespace in item text', () => {
    assert.equal(
      convertLatexItemizeToMarkdown('\\begin{itemize}\\item  Foo   Bar  \\end{itemize}'),
      '<markdown>\n- Foo Bar\n</markdown>',
    );
  });
});

describe('rewritePreAsPlCode', () => {
  it('converts a plain pre block to pl-code', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre>hello world</pre>'),
      '<pl-code>hello world</pl-code>',
    );
  });

  it('extracts language from class="language-X" on pre', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre class="language-python">x = 1</pre>'),
      '<pl-code language="python">x = 1</pl-code>',
    );
  });

  it('extracts language from class="lang-X" on pre', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre class="lang-javascript">const x = 1;</pre>'),
      '<pl-code language="javascript">const x = 1;</pl-code>',
    );
  });

  it('extracts language from brush: X class on pre', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre class="brush: python;">x = 1</pre>'),
      '<pl-code language="python">x = 1</pl-code>',
    );
  });

  it('strips inner <code> wrapper and reads its class', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre><code class="language-java">int x = 0;</code></pre>'),
      '<pl-code language="java">int x = 0;</pl-code>',
    );
  });

  it('prefers pre class over inner code class', async () => {
    assert.equal(
      await rewritePreAsPlCode(
        '<pre class="language-python"><code class="language-java">x = 1</code></pre>',
      ),
      '<pl-code language="python">x = 1</pl-code>',
    );
  });

  it('strips inner <code> with no class', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre><code>print("hi")</code></pre>'),
      '<pl-code language="python">print("hi")</pl-code>',
    );
  });

  it('unwraps pl-code from a surrounding <p>', async () => {
    assert.equal(
      await rewritePreAsPlCode('<p><pre>x = 1</pre></p>'),
      '<pl-code>x = 1</pl-code>',
    );
  });

  it('leaves <p> intact when it contains more than just pl-code', async () => {
    const result = await rewritePreAsPlCode('<p>See: <pre>x = 1</pre></p>');
    assert.include(result, '<p>');
    assert.include(result, '<pl-code>');
  });

  it('passes through HTML with no pre tags unchanged', async () => {
    const html = '<p>No code here</p>';
    assert.equal(await rewritePreAsPlCode(html), html);
  });
});

describe('cleanQuestionHtml', () => {
  it('strips wrapping div', () => {
    assert.equal(cleanQuestionHtml('<div><p>Hello</p></div>'), '<p>Hello</p>');
  });

  it('preserves content without wrapping div', () => {
    assert.equal(cleanQuestionHtml('<p>Hello</p>'), '<p>Hello</p>');
  });

  it('trims whitespace', () => {
    assert.equal(cleanQuestionHtml('  <p>Hello</p>  '), '<p>Hello</p>');
  });
});
