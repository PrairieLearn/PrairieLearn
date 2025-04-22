## Using Markdown in questions

HTML and custom elements are great for flexibility and expressiveness. However, they're not great for working with large amounts of text, formatting text, and so on. [Markdown](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet) is a lightweight plaintext markup syntax that's ideal for authoring simple but rich text. To enable this, PrairieLearn adds a special `<markdown>` tag to questions. When a `<markdown>` block is encountered, its contents are converted to HTML. Here's an example `question.html` that utilizes this element:

<!-- prettier-ignore -->
```html title="question.html"
<markdown>
# Hello, world!

This is some **Markdown** text.
</markdown>
```

That question would be rendered like this:

```html
<h1>Hello, world!</h1>
<p>This is some <strong>Markdown</strong> text.</p>
```

!!! warning

    Note that markdown recognizes indentation as a code block, so text inside these tags should not be indented with the corresponding HTML content.

    === "Good"

        ```html
        <div>
          <markdown>
        # Hello, world!
          </markdown>
        </div>
        ```
    === "Bad"

        ```html
        <div>
          <markdown>
            # Hello, world!
          </markdown>
        </div>
        ```

A few special behaviors have been added to enable Markdown to work better within the PrairieLearn ecosystem, as described below.

### Markdown code blocks

Fenced code blocks (those using triple-backticks ` ``` `) are rendered as [`<pl-code>` elements](../elements.md#pl-code-element), which will then be rendered as usual by PrairieLearn. These blocks support specifying language and highlighted lines, which are then passed to the resulting `<pl-code>` element. Consider the following Markdown:

<!-- prettier-ignore -->
````html title="question.html"
<markdown>
```cpp{1-2,4}
int i = 1;
int j = 2;
int k = 3;
int m = 4;
```
</markdown>
````

This will be rendered to the following `<pl-code>` element (which itself will eventually be rendered to standard HTML):

<!-- prettier-ignore -->
```html
<pl-code language="cpp" highlight-lines="1-2,4">
int i = 1;
int j = 2;
int k = 3;
int m = 4;
</pl-code>
```

### Escaping `<markdown>` tags

Under the hood, PrairieLearn is doing some very simple parsing to determine what pieces of a question to process as Markdown: it finds an opening `<markdown>` tag and processes everything up to the closing `</markdown>` tag. But what if you want to have a literal `<markdown>` or `</markdown>` tag in your question? PrairieLearn defines a special escape syntax to enable this. If you have `<markdown#>` or `</markdown#>` in a Markdown block, they will be rendered as `<markdown>` and `</markdown>` respectively (but will not be used to find regions of text to process as Markdown). You can use more hashes to produce different strings: for instance, to have `<markdown###>` show up in the output, write `<markdown####>` in your question.

## Using LaTeX in questions (math mode)

PrairieLearn supports LaTeX equations in questions. You can view a full list of [supported MathJax commands](https://docs.mathjax.org/en/latest/input/tex/macros/index.html).

Inline equations can be written using `$x^2$` or `\(x^2\)`, and display equations can be written using `$$x^2$$` or `\[x^2\]`. For example:

<!-- prettier-ignore -->
```html title="question.html"
<p>Here is some inline math: $x^2$. Here is some display math: $$x^2$$</p>
<p>What is the total force $F$ currently acting on the particle?</p>

<markdown>
# LaTeX works in Markdown too!

$$\phi = \frac{1+\sqrt{5}}{2}$$
</markdown>
```

### Using a dollar sign ($) without triggering math mode

Dollar signs by default denote either **inline** (`$ x $`) or **display mode** (`$$ x $$`) environments.

To escape either math environment, consider using PrairieLearn's `<markdown>` tag and inline code syntax.

<!-- prettier-ignore -->
```html
<markdown>
What happens if we use a `$` to reference the spreadsheet cell location `$A$1`?
</markdown>
```

In scenarios where it does not make sense to use the code environment, consider disabling math entirely by
adding the `mathjax_ignore` class to an HTML element.

```html
<div class="mathjax_ignore">
  Mary has $5 to spend. If each apple costs $2 dollars and a banana costs $1 dollar, then how many
  pieces of fruit can Mary get?
</div>

<div>$x = 1$ and I have <span class="mathjax_ignore">$</span>5 dollars.</div>
```

## Rendering panels from `question.html`

When a question is displayed to a student, there are three "panels" that will be shown at different stages: the "question" panel, the "submission" panel, and the "answer" panel. These display the question prompt, the solution provided by the student, and the correct answer.

All three panels display the same `question.html` template, but elements will render differently in each panel. For example, the `<pl-number-input>` element displays an input box in the "question" panel, the submitted answer in the "submissions" panel, and the correct answer in the "answer" panel.

Text in `question.html` can be set to only display in the "question" panel by wrapping it in the `<pl-question-panel>` element. This is useful for the question prompt, which doesn't need to be repeated in the "submission" and "answer" panels. There are also elements that only render in the other two panels.

## Hiding staff comments in `question.html`

Please note that HTML or JavaScript comments in your `question.html` source may be visible to students in the rendered page source. To leave small maintenance notes to staff in your `question.html` source, you may prefer to use a Mustache comment that will stay hidden. Please refer to [this FAQ item](../faq.md#how-can-i-add-comments-in-my-questionhtml-source-that-wont-be-visible-to-students).

## How questions are rendered

Questions are rendered in two possible ways: with the "legacy renderer" and the "new renderer". Currently, the legacy renderer is the default, but the new renderer will eventually replace the legacy renderer entirely. The new renderer uses a different HTML parser, which behaves differently than the old one for malformed HTML and could result in breaking changes.

**TL;DR** If you're starting a new course, you should write questions with the new renderer in mind, as it will soon become the default.

> Aside: when we say "renderer", we're really talking about how we traverse the tree of elements in a question to process them. However, the way in which this occurs typically only matters during the "render" phase, so we talk about it as a "renderer".

### The legacy renderer

The legacy renderer uses a naive approach to rendering: it renders elements in order of name. This poses some performance problems: if an element will never actually have its output rendered on screen (for instance, it's inside a `<pl-question-panel>` and the current panel being rendered is the "answer" panel), it's possible that we'll still perform some expensive IPC to try to render a panel that will never be shown! Internally, the architecture provides inconsistent support for nested elements. For instance, if you wanted to use figures in multiple choice answers, they may not be rendered correctly:

```html
<pl-multiple-choice>
  <pl-answer correct="true">
    <pl-figure file-name="fig1.png">
  </pl-answer>
  <pl-answer correct="false">
    <pl-figure file-name="fig2.png">
  </pl-answer>
</pl-multiple-choice>
```

Based on the order that the elements get rendered, the inner `<pl-figure>` elements might not get processed correctly. This is due to behavior in a dependency called [cheerio](https://github.com/cheeriojs/cheerio) that we use to build up the rendered HTML for a question. One benefit of this dependency is that its parser is more forgiving when encountering invalid HTML. However, this also made it more difficult to process the question properly as a tree. Which brings us to...

### The new renderer

The new renderer is rewritten from the ground up to solve the problems inherent in the old renderer. Questions are now properly processed like a tree in a deterministic order. Let's reconsider the example above:

```html
<pl-multiple-choice answers-name="student">
  <pl-answer correct="true">
    <pl-figure file-name="fig1.png"></pl-figure>
  </pl-answer>
  <pl-answer correct="false">
    <pl-figure file-name="fig2.png"></pl-figure>
  </pl-answer>
</pl-multiple-choice>
```

If you imagine this being parsed into an abstract syntax tree, we have a `<pl-multiple-choice>` element with two `<pl-answer>` children elements, each of which has a `<pl-figure>` child element. When rendering this question, we first render the `<pl-multiple-choice>` element, which will produce some hypothetical markup that wraps each answer:

```html
<div class="foo">
  <input type="radio" name="student" />
  <pl-figure file-name="fig1.png"></pl-figure>
</div>
<div class="foo">
  <input type="radio" name="student" />
  <pl-figure file-name="fig2.png"></pl-figure>
</div>
```

We then re-parse this tree and again begin looking for more elements to render. We'll then come across each `<pl-figure>` in turn and they will be rendered, with their markup re-inserted into the tree:

```html
<div class="foo">
  <input type="radio" name="student" />
  <img src="fig1.png" />
</div>
<div class="foo">
  <input type="radio" name="student" />
  <img src="fig2.png" />
</div>
```

And then we're done! This is an obviously more correct way to process questions, and it will soon become the default. However, this change required introducing a new HTML parser that behaves differently in the presence of malformed HTML, such as missing closing tags or self-closing PrairieLearn elements. So, we are making this new renderer opt-in for the time being until we can ensure that everyone's questions have been properly updated.

To opt in to the new renderer, add the following to your `infoCourse.json` file:

```json title="infoCourse.json"
{
  "options": {
    "useNewQuestionRenderer": true
  }
}
```

Note that this will apply to all questions, so make sure to check that you've been writing valid HTML.

Example of invalid HTML:

```html
<p>This is a picture of a bird <pl-figure file-name="bird.html" /></p>
```

Example of valid HTML:

```html
<p>This is a picture of a bird</p>
<pl-figure file-name="bird.html"></pl-figure>
```
