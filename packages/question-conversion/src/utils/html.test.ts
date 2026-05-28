import { assert, describe, it } from 'vitest';

import {
  cleanQuestionHtml,
  convertLatexItemizeToMarkdown,
  extractInlineImages,
  resolveImsFileRefs,
  rewriteImagesAsPlFigure,
  rewritePreAsPlCode,
} from './html.js';

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
    assert.equal(result.html, `<img src="{{ options.client_files_question_url }}/${filename}">`);
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

  it('strips the Mustache clientFilesQuestion URL prefix and sets directory attribute', () => {
    assert.equal(
      rewriteImagesAsPlFigure('<img src="{{ options.client_files_question_url }}/image.png">'),
      '<pl-figure file-name="image.png" directory="clientFilesQuestion"></pl-figure>',
    );
  });

  it('preserves alt and width attributes, drops height', () => {
    assert.equal(
      rewriteImagesAsPlFigure(
        '<img src="{{ options.client_files_question_url }}/img.png" alt="A diagram" width="300" height="200">',
      ),
      '<pl-figure file-name="img.png" directory="clientFilesQuestion" alt="A diagram" width="300"></pl-figure>',
    );
  });

  it('decodes attribute entities before re-escaping pl-figure attributes', () => {
    assert.equal(
      rewriteImagesAsPlFigure(
        '<img src="{{ options.client_files_question_url }}/foo&amp;bar.png" alt="A &amp; B">',
      ),
      '<pl-figure file-name="foo&amp;bar.png" directory="clientFilesQuestion" alt="A &amp; B"></pl-figure>',
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

  it('adds responsive style to unstyled absolute http(s) URLs', () => {
    const html = '<img src="https://example.com/img.png" alt="external">';
    assert.equal(
      rewriteImagesAsPlFigure(html),
      '<img src="https://example.com/img.png" alt="external" style="max-width: 100%;">',
    );
  });

  it('adds responsive style to unstyled protocol-relative URLs', () => {
    const html = '<img src="//cdn.example.com/img.png">';
    assert.equal(
      rewriteImagesAsPlFigure(html),
      '<img src="//cdn.example.com/img.png" style="max-width: 100%;">',
    );
  });

  it('leaves already styled absolute URLs unchanged', () => {
    const html = '<img src="https://example.com/img.png" style="width: 300px;">';
    assert.equal(rewriteImagesAsPlFigure(html), html);
  });

  it('leaves classed absolute URLs unchanged', () => {
    const html = '<img src="https://example.com/img.png" class="equation_image">';
    assert.equal(rewriteImagesAsPlFigure(html), html);
  });

  it('leaves data: URLs as <img>', () => {
    const html = '<img src="data:image/png;base64,AAAA">';
    assert.equal(rewriteImagesAsPlFigure(html), html);
  });

  it('passes through HTML with no img tags unchanged', () => {
    const html = '<p>No images here</p>';
    assert.equal(rewriteImagesAsPlFigure(html), html);
  });
});

describe('resolveImsFileRefs', () => {
  it('rewrites $IMS-CC-FILEBASE$ to the Mustache clientFilesQuestion URL', () => {
    const html = '<img src="$IMS-CC-FILEBASE$/Quiz%20Files/image.png">';
    const result = resolveImsFileRefs(html);
    assert.equal(result.html, '<img src="{{ options.client_files_question_url }}/image.png">');
    assert.equal(result.fileRefs.get('image.png'), 'Quiz Files/image.png');
    assert.deepEqual(result.skippedFiles, []);
  });

  it('comments out tags that reference excluded extensions', () => {
    const html = '<a href="$IMS-CC-FILEBASE$/media/clip.mp4">Watch</a>';
    const result = resolveImsFileRefs(html, new Set(['.mp4']));
    assert.equal(
      result.html,
      '<!-- TODO: Re-host this file and update the URL below, then uncomment to restore.\n' +
        '<a href="{{ options.client_files_question_url }}/clip.mp4">Watch</a>\n' +
        '-->',
    );
    assert.equal(result.fileRefs.size, 0);
    assert.deepEqual(result.skippedFiles, ['media/clip.mp4']);
  });

  it('comments out self-closing tags that reference excluded extensions', () => {
    const html = '<video src="$IMS-CC-FILEBASE$/clip.webm" />';
    const result = resolveImsFileRefs(html, new Set(['.webm']));
    assert.equal(
      result.html,
      '<!-- TODO: Re-host this file and update the URL below, then uncomment to restore.\n' +
        '<video src="{{ options.client_files_question_url }}/clip.webm" />\n' +
        '-->',
    );
    assert.deepEqual(result.skippedFiles, ['clip.webm']);
  });

  it('matches extension case-insensitively', () => {
    const html = '<a href="$IMS-CC-FILEBASE$/clip.MP4">Watch</a>';
    const result = resolveImsFileRefs(html, new Set(['.mp4']));
    assert.deepEqual(result.skippedFiles, ['clip.MP4']);
    assert.equal(result.fileRefs.size, 0);
  });

  it('leaves non-excluded references intact alongside excluded ones', () => {
    const html =
      '<img src="$IMS-CC-FILEBASE$/image.png"><a href="$IMS-CC-FILEBASE$/clip.mp4">Watch</a>';
    const result = resolveImsFileRefs(html, new Set(['.mp4']));
    assert.include(result.html, '<img src="{{ options.client_files_question_url }}/image.png">');
    assert.include(result.html, '<!-- TODO: Re-host this file');
    assert.include(
      result.html,
      '<a href="{{ options.client_files_question_url }}/clip.mp4">Watch</a>',
    );
    assert.equal(result.fileRefs.get('image.png'), 'image.png');
    assert.deepEqual(result.skippedFiles, ['clip.mp4']);
  });

  it('only wraps the inner excluded tag when a container has its own non-excluded ref', () => {
    const html =
      '<div data-bg="$IMS-CC-FILEBASE$/bg.png"><video src="$IMS-CC-FILEBASE$/clip.mp4"></video><p>Prompt</p></div>';
    const result = resolveImsFileRefs(html, new Set(['.mp4']));
    assert.equal(
      result.html,
      '<div data-bg="{{ options.client_files_question_url }}/bg.png">' +
        '<!-- TODO: Re-host this file and update the URL below, then uncomment to restore.\n' +
        '<video src="{{ options.client_files_question_url }}/clip.mp4"></video>\n' +
        '-->' +
        '<p>Prompt</p></div>',
    );
    assert.equal(result.fileRefs.get('bg.png'), 'bg.png');
    assert.deepEqual(result.skippedFiles, ['clip.mp4']);
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
      '<pl-code>\nhello world</pl-code>',
    );
  });

  it('extracts language from class="language-X" on pre', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre class="language-python">x = 1</pre>'),
      '<pl-code language="python">\nx = 1</pl-code>',
    );
  });

  it('extracts language from class="lang-X" on pre', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre class="lang-javascript">const x = 1;</pre>'),
      '<pl-code language="javascript">\nconst x = 1;</pl-code>',
    );
  });

  it('extracts language from brush: X class on pre', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre class="brush: python;">x = 1</pre>'),
      '<pl-code language="python">\nx = 1</pl-code>',
    );
  });

  it('strips inner <code> wrapper and reads its class', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre><code class="language-java">int x = 0;</code></pre>'),
      '<pl-code language="java">\nint x = 0;</pl-code>',
    );
  });

  it('prefers pre class over inner code class', async () => {
    assert.equal(
      await rewritePreAsPlCode(
        '<pre class="language-python"><code class="language-java">x = 1</code></pre>',
      ),
      '<pl-code language="python">\nx = 1</pl-code>',
    );
  });

  it('strips inner <code> with no class', async () => {
    assert.equal(
      await rewritePreAsPlCode('<pre><code>print("hi")</code></pre>'),
      '<pl-code language="python">\nprint("hi")</pl-code>',
    );
  });

  it('unwraps pl-code from a surrounding <p>', async () => {
    assert.equal(await rewritePreAsPlCode('<p><pre>x = 1</pre></p>'), '<pl-code>\nx = 1</pl-code>');
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

  it('strips <span> and <br> tags from code content', async () => {
    const input =
      '<pre><span>for (int i = 0; i &lt;= n; i++)<br></span><span>  // body<br></span></pre>';
    const result = await rewritePreAsPlCode(input);
    assert.include(result, '<pl-code');
    assert.notInclude(result, '<span>');
    assert.notInclude(result, '<br>');
    assert.include(result, 'for (int i = 0; i <= n; i++)\n');
    assert.include(result, '  // body\n');
  });
});

describe('cleanQuestionHtml', () => {
  it('strips wrapping div', () => {
    assert.equal(cleanQuestionHtml('<div><p>Hello</p></div>'), '<p>Hello</p>');
  });

  it('strips wrapping div with attributes', () => {
    assert.equal(cleanQuestionHtml('<div class="prompt"><p>Hello</p></div>'), '<p>Hello</p>');
  });

  it('preserves sibling divs instead of stripping the first open and last close', () => {
    const html = '<div>First</div><div><div>Second</div></div>';
    assert.equal(cleanQuestionHtml(html), html);
  });

  it('preserves content without wrapping div', () => {
    assert.equal(cleanQuestionHtml('<p>Hello</p>'), '<p>Hello</p>');
  });

  it('trims whitespace', () => {
    assert.equal(cleanQuestionHtml('  <p>Hello</p>  '), '<p>Hello</p>');
  });
});
