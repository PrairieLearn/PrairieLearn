export const content = `
<h1>Getting started</h1>
<p>
  Welcome to the
  <em
    ><mark
      data-color="var(--tt-color-highlight-yellow)"
      style="background-color: var(--tt-color-highlight-yellow); color: inherit;"
      >Simple Editor</mark
    ></em
  >
  template! This template integrates <strong>open source</strong> UI components and Tiptap
  extensions licensed under <strong>MIT</strong>.
</p>
<my-invalid-node>
  This is an invalid node.
</my-invalid-node>
<p>
  Integrate it by following the
  <a
    target="_blank"
    rel="noopener noreferrer nofollow"
    href="https://tiptap.dev/docs/ui-components/templates/simple-editor"
    >Tiptap UI Components docs</a
  >
  or using our CLI tool.
</p>
<pl-code
  nohighlight="false"
  preventselect="false"
  copycodebutton="false"
  showlinenumbers="false"
  normalizewhitespace="false"
  style="">
npx @tiptap/cli init
npm i code-block-extension
</pl-code>
<h2>Features</h2>
<blockquote>
  <p>
    <em
      >A fully responsive rich ttext editor with built-in support for common formatting and layout
      tools. Type markdown </em
    ><code>**</code><em> or use keyboard shortcuts </em><code>⌘+B</code> for <s>most</s> all common
    markdown marks. 🪄
  </p>
</blockquote>
<p style="text-align: left;">
  Add images, customize alignment, and apply
  <mark
    data-color="var(--tt-color-highlight-blue)"
    style="background-color: var(--tt-color-highlight-blue); color: inherit;"
    >advanced formatting</mark
  >
  to make your writing more engaging and professional.
</p>
<ul>
  <li>
    <p style="text-align: left;">
      <strong>Superscript</strong> (x<sup>2</sup>) and <strong>Subscript</strong> (H<sub>2</sub>O)
      for precision.
    </p>
  </li>
  <li>
    <p style="text-align: left;">
      <strong>Typographic conversion</strong>: automatically convert to <code>-&gt;</code> an arrow
      <strong>→</strong>.
    </p>
  </li>
</ul>
<p style="text-align: left;">
  <em>→ </em
  ><a
    target="_blank"
    rel="noopener noreferrer nofollow"
    href="https://tiptap.dev/docs/ui-components/templates/simple-editor#features"
    >Learn more</a
  >
</p>
<hr />
<h2 style="text-align: left;">Make it your own</h2>
<p style="text-align: left;">
  Switch between light and dark modes, and tailor the editor's appearance with customizable CSS to
  match your style.
</p>
<ul data-type="taskList">
  <li data-checked="true" data-type="taskItem">
    <label><input type="checkbox" checked="checked" /><span></span></label>
    <div><p style="text-align: left;">Test template</p></div>
  </li>
  <li data-checked="false" data-type="taskItem">
    <label><input type="checkbox" /><span></span></label>
    <div>
      <p style="text-align: left;">
        <a
          target="_blank"
          rel="noopener noreferrer nofollow"
          href="https://tiptap.dev/docs/ui-components/templates/simple-editor"
          >Integrate the free template</a
        >
      </p>
    </div>
  </li>
</ul>
<p style="text-align: left;"></p>
`;
