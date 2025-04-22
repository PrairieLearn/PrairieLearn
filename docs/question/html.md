# `question.html`

## Template file

All `question.html` files are rendered with the [Mustache](https://mustache.github.io/mustache.5.html) template engine. Outside direct variable substitution, you can use Mustache to do things like conditionally render elements and render over arrays. For example, you can use the following syntax to conditionally render a piece of HTML:

```html title="question.html"
{{#params.show}}
<p>This will only show up if params.show is true</p>
{{/params.show}}
```

and this syntax to render over an array of strings (the `.` represents the current item in the array):

```html title="question.html"
{{#params.items}}
<p>{{.}}</p>
{{/params.items}}
```

!!! tip

    If you use triple-braces (e.g. `{{{params.html}}}`) then raw HTML is substituted (don't use this unless you know you need it).

## Markdown in questions

HTML and custom elements are great for flexibility and expressiveness. However, they're not great for working with large amounts of text, formatting text, and so on. [Markdown](https://github.com/adam-p/markdown-here/wiki/Markdown-Cheatsheet) is a lightweight plaintext markup syntax that's ideal for authoring simple but rich text.

You can use the special `<markdown>` tag to automatically convert its contents to HTML. Here's an example `question.html` that utilizes this element:

<!-- prettier-ignore -->
```html title="question.html"
<markdown>
# Hello, world! This is some **Markdown** text.
</markdown>
```

That question would be rendered like this:

```html
<h1>Hello, world!</h1>
<p>This is some <strong>Markdown</strong> text.</p>
```

!!! warning

    Markdown recognizes indentation as a code block, so text inside these tags should **not** be indented with the corresponding HTML content.

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

PrairieLearn defines a special escape syntax to allow a literal `<markdown>` or `</markdown>` tag in your question. If you have `<markdown#>` or `</markdown#>` in a Markdown block, they will be rendered as `<markdown>` and `</markdown>` respectively (but will not be used to find regions of text to process as Markdown).

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

When a question is displayed to a student, there are three "panels" that will be shown at different stages: the `"question"` panel, the `"submission"` panel, and the `"answer"` panel. These display the question prompt, the solution provided by the student, and the correct answer.

The `"question"` panel is displayed when the question is first shown to the student. The `"submission"` panel is displayed after the student submits an answer (but before they finish attempting the question), and the `"answer"` panel is displayed when the student either submits the correct answer or runs out of attempts. You can see the [lifecycle diagram](server.md#question-lifecycle) for more details on how these panels are displayed.

All three panels display the same `question.html` template, but elements will render differently in each panel. For example, the `<pl-number-input>` element displays an input box in the "question" panel, the submitted answer in the "submissions" panel, and the correct answer in the "answer" panel.

Text in `question.html` can be set to only display in the "question" panel by wrapping it in the `<pl-question-panel>` element. This is useful for the question prompt, which doesn't need to be repeated in the "submission" and "answer" panels. There are also elements that only render in the other two panels.

## Hiding staff comments in `question.html`

HTML or JavaScript comments in your `question.html` source are visible to students in the rendered page source. To leave small maintenance notes to staff in your `question.html` source, you should use [Mustache comments](https://mustache.github.io/mustache.5.html#Comments) (`{{! ... }}`) that will be removed during the rendering process. Never put sensitive information, such as solutions, in a HTML/JS comment.

Example:

```html
<!-- This HTML comment will not be visible to students in the web page, 
 but *will be included* in the rendered page source, so students may be able to
 see it by reading the HTML source. -->
{{! This Mustache comment will NOT be included in the rendered page source. }}
```
