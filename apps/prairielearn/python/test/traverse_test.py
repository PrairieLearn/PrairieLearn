from typing import TYPE_CHECKING

import lxml.html
from prairielearn.internal.traverse import (
    ElementReplacement,
    traverse_and_execute,
    traverse_and_replace,
)

if TYPE_CHECKING:
    from lxml.etree import QName


def test_traverse_and_execute() -> None:
    text: list[str] = []
    tags: list[str | bytearray | bytes | QName] = []

    def capture_element(element: lxml.html.HtmlElement) -> None:
        if element.text:
            text.append(element.text)
        tags.append(element.tag)

    traverse_and_execute("<p><i>Hello</i> <strong>world</strong></p>", capture_element)

    assert text == ["Hello", "world"]
    assert tags == ["p", "i", "strong"]


def test_traverse_and_replace_text() -> None:
    html = traverse_and_replace("Hello", lambda _: "Goodbye")
    assert html == "Hello"


def test_traverse_and_replace_none() -> None:
    html = traverse_and_replace("<p>Hello</p>", lambda _: None)
    assert html == ""


def test_traverse_and_replace_comment() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "p":
            return "<!-- Goodbye --><i>world</i>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<!-- Goodbye --><i>world</i>"


def test_traverse_and_replace_comment_nested() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "span":
            return "<!-- Goodbye --><strong>world</strong>"
        return e

    html = traverse_and_replace("<p><span>Hello</span></p>", replace)
    assert html == "<p><!-- Goodbye --><strong>world</strong></p>"


def test_traverse_and_replace_comment_with_text() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace("<div><!-- Hello --> world</div>", replace)
    assert html == "<div><!-- Hello --> world</div>"


def test_traverse_and_replace_nested_none() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "strong":
            return None
        return e

    html = traverse_and_replace("<p><strong>Hello</strong> world</p>", replace)
    # The leading space is consistent with the DOM's behavior if a node is removed.
    assert html == "<p> world</p>"


def test_traverse_and_replace_empty() -> None:
    html = traverse_and_replace("<p>Hello</p>", lambda _: "")
    assert html == ""


def test_traverse_and_replace_identity() -> None:
    html = traverse_and_replace("<p>Hello</p>", lambda e: e)
    assert html == "<p>Hello</p>"


def test_traverse_and_replace_fragment() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "p":
            return "<strong>Goodbye</strong>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<strong>Goodbye</strong>"


def test_traverse_and_replace_fragments() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "p":
            return "<strong>Goodbye</strong><strong>Goodbye</strong>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<strong>Goodbye</strong><strong>Goodbye</strong>"


def traverse_and_replace_nested() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p><strong>Hello</strong></p>", replace)
    assert html == "<p><em>Goodbye</em></p>"


def test_traverse_and_replace_recursive() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "p":
            return "<strong>Goodbye</strong>"
        elif e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<em>Goodbye</em>"


def test_traverse_and_replace_nested_trailing_text() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p><strong>Hello</strong> world</p>", replace)
    assert html == "<p><em>Goodbye</em> world</p>"


def test_traverse_and_replace_leading_trailing_text() -> None:
    html = traverse_and_replace("Hello <i>cruel</i> world", lambda _: "beautiful")
    assert html == "Hello beautiful world"


def test_traverse_and_replace_leading_trailing_recursive() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "i":
            return "<em>beautiful</em>"
        return e

    html = traverse_and_replace("Hello <i>cruel</i> world", replace)
    assert html == "Hello <em>beautiful</em> world"


def test_traverse_and_replace_leading_trailing_recursive_2() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "i":
            return "<em>beautiful</em>"
        if e.tag == "em":
            return "beautiful"
        return e

    html = traverse_and_replace("Hello <i>cruel</i> world", replace)
    assert html == "Hello beautiful world"


def test_traverse_and_replace_leading_trailing_recursive_3() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "i":
            return "really <em>beautiful</em> green"
        if e.tag == "em":
            return "beautiful"
        return e

    html = traverse_and_replace("Hello <i>cruel</i> world", replace)
    assert html == "Hello really beautiful green world"


def test_traverse_and_replace_leading_trailing_recursive_4() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "i":
            return "really <em>beautiful</em> green"
        if e.tag == "em":
            return "beautiful"
        return e

    html = traverse_and_replace("<div>Hello <i>cruel</i> world</div>", replace)
    assert html == "<div>Hello really beautiful green world</div>"


def test_traverse_and_replace_leading_trailing_recursive_5() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "em":
            return "big"
        if e.tag == "i":
            return "beautiful"
        return e

    html = traverse_and_replace(
        "<div>Hello <em>small</em> and <i>cruel</i> world</div>", replace
    )
    assert html == "<div>Hello big and beautiful world</div>"


def test_traverse_and_replace_leading_trailing_recursive_6() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "em":
            return "<strong>big</strong>"
        if e.tag == "i":
            return "beautiful"
        return e

    html = traverse_and_replace(
        "<div>Hello <em>small</em> and <i>cruel</i> world</div>", replace
    )
    assert html == "<div>Hello <strong>big</strong> and beautiful world</div>"


def test_traverse_and_replace_leading_trailing_recursive_7() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "em":
            return "<strong>big</strong>, green,"
        if e.tag == "i":
            return "beautiful"
        return e

    html = traverse_and_replace(
        "<div>Hello <em>small</em> and <i>cruel</i> world</div>", replace
    )
    assert html == "<div>Hello <strong>big</strong>, green, and beautiful world</div>"


def test_traverse_and_replace_leading_trailing_recursive_8() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "em":
            return "green, <strong>big</strong>"
        if e.tag == "i":
            return "beautiful"
        return e

    html = traverse_and_replace(
        "<div>Hello <em>small</em> and <i>cruel</i> world</div>", replace
    )
    assert html == "<div>Hello green, <strong>big</strong> and beautiful world</div>"


def test_traverse_indentation() -> None:
    original_html = "<div><pre><code>def hello(msg):\n    print(msg)</code></pre></div>"
    html = traverse_and_replace(
        original_html,
        lambda e: e,
    )
    assert html == original_html


def test_traverse_pre_html4_entities() -> None:
    original_html = "<pre>1 &lt; 2 &amp;&amp; 3 &gt; 2</pre>"
    html = traverse_and_replace(
        original_html,
        lambda e: e,
    )
    assert html == original_html


# This test specifically checks for HTML5 entity handling, which `lxml`
# doesn't natively support: https://gitlab.gnome.org/GNOME/libxml2/-/issues/857
#
# We specifically expect to get back the actual Unicode characters, not the
# original named entities.
def test_traverse_pre_html5_entities() -> None:
    original_html = "<pre>&langle;v, w&rangle;</pre>"
    html = traverse_and_replace(
        original_html,
        lambda e: e,
    )
    assert html == "<pre>⟨v, w⟩</pre>"


def test_traverse_and_replace_attribute_quotes() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "span":
            return "<strong attr1='a\"b' attr2=\"a'b\">Goodbye</strong>"
        return e

    html = traverse_and_replace(
        "<div><span>Hello</span></div>",
        replace,
    )
    assert html == '<div><strong attr1="a&quot;b" attr2="a\'b">Goodbye</strong></div>'


def test_traverse_and_replace_attribute_nbsp() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "div":
            return '<span attr="foo &nbsp; bar">Goodbye</span>'
        return e

    html = traverse_and_replace(
        "<div>Hello</div>",
        replace,
    )
    assert html == '<span attr="foo &nbsp; bar">Goodbye</span>'


def test_traverse_and_replace_attribute_ampersand() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "div":
            return '<span attr="foo & bar">Goodbye</span>'
        return e

    html = traverse_and_replace(
        "<div>Hello</div>",
        replace,
    )
    assert html == '<span attr="foo &amp; bar">Goodbye</span>'


def test_traverse_and_replace_void_elements() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace('<div><br><input name="input"></div>', replace)
    assert html == '<div><br><input name="input"></div>'


def test_traverse_and_replace_angle_brackets() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "pl-code":
            return "<pre><code>&lt;div&gt;</code></pre>"
        return e

    html = traverse_and_replace("<pl-code></pl-code>", replace)
    assert html == "<pre><code>&lt;div&gt;</code></pre>"


def test_traverse_and_replace_trailing_entity() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        if e.tag == "div":
            return "<span><span>Goodbye</span> &amp;</span>"
        return e

    html = traverse_and_replace("<div>Hello</div>", replace)
    assert html == "<span><span>Goodbye</span> &amp;</span>"


def test_traverse_and_replace_comment_trailing_entity() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace("hello <!-- comment --> &amp;", replace)
    assert html == "hello <!-- comment --> &amp;"


def test_traverse_and_replace_processing_instruction_trailing_entity() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace('hello <?xml version="1.0"?> &amp;', replace)
    assert html == 'hello <!--?xml version="1.0"?--> &amp;'


def test_traverse_and_replace_xml_processing_instruction() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace('hello <?xml version="1.0"?> world', replace)
    assert html == 'hello <!--?xml version="1.0"?--> world'


def test_traverse_and_replace_empty_paragraph() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace("<p></p>", replace)
    assert html == "<p></p>"


def test_traverse_and_replace_script() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    html = traverse_and_replace('<script>""</script>', replace)
    assert html == '<script>""</script>'


def test_traverse_and_replace_script_complex() -> None:
    def replace(e: lxml.html.HtmlElement) -> ElementReplacement:
        return e

    test_str = (
        '<script>const test = "&quot;";</script>'
        '<style>.class-a > .class-b::before { content: "a &gt; b"; }</style>'
    )

    html = traverse_and_replace(test_str, replace)
    assert html == test_str
