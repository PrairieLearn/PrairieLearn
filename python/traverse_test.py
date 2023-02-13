from typing import List

from traverse import ElementReplacement, traverse_and_execute, traverse_and_replace


def test_traverse_and_execute() -> None:
    text: List[str] = []
    tags: List[str] = []

    def capture_element(element) -> None:
        if element.text:
            text.append(element.text)
        tags.append(element.tag)

    traverse_and_execute("<p><i>Hello</i> <strong>world</strong></p>", capture_element)

    assert text == ["Hello", "world"]
    assert tags == ["p", "i", "strong"]


def test_traverse_and_replace_text() -> None:
    html = traverse_and_replace("Hello", lambda e: "Goodbye")
    assert html == "Hello"


def test_traverse_and_replace_none() -> None:
    html = traverse_and_replace("<p>Hello</p>", lambda e: None)
    assert html == ""


def test_traverse_and_replace_comment() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "p":
            return "<!-- Goodbye --><i>world</i>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<!-- Goodbye --><i>world</i>"


def test_traverse_and_replace_nested_none() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "strong":
            return None
        return e

    html = traverse_and_replace("<p><strong>Hello</strong> world</p>", replace)
    assert html == "<p>world</p>"


def test_traverse_and_replace_empty() -> None:
    html = traverse_and_replace("<p>Hello</p>", lambda e: "")
    assert html == ""


def test_traverse_and_replace_identity() -> None:
    html = traverse_and_replace("<p>Hello</p>", lambda e: e)
    assert html == "<p>Hello</p>"


def test_traverse_and_replace_fragment() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "p":
            return "<strong>Goodbye</strong>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<strong>Goodbye</strong>"


def test_traverse_and_replace_fragments() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "p":
            return "<strong>Goodbye</strong><strong>Goodbye</strong>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<strong>Goodbye</strong><strong>Goodbye</strong>"


def traverse_and_replace_nested() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p><strong>Hello</strong></p>", replace)
    assert html == "<p><em>Goodbye</em></p>"


def test_traverse_and_replace_recursive() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "p":
            return "<strong>Goodbye</strong>"
        elif e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<em>Goodbye</em>"


def test_traverse_and_replace_nested_trailing_text() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p><strong>Hello</strong> world</p>", replace)
    assert html == "<p><em>Goodbye</em> world</p>"


def test_traverse_and_replace_leading_trailing_text() -> None:
    html = traverse_and_replace("Hello <i>cruel</i> world", lambda e: "beautiful")
    assert html == "Hello beautiful world"


def test_traverse_and_replace_leading_trailing_recursive() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "i":
            return "<em>beautiful</em>"
        return e

    html = traverse_and_replace("Hello <i>cruel</i> world", replace)
    assert html == "Hello <em>beautiful</em> world"


def test_traverse_and_replace_leading_trailing_recursive_2() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "i":
            return "<em>beautiful</em>"
        if e.tag == "em":
            return "beautiful"
        return e

    html = traverse_and_replace("Hello <i>cruel</i> world", replace)
    assert html == "Hello beautiful world"


def test_traverse_and_replace_leading_trailing_recursive_3() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "i":
            return "really <em>beautiful</em> green"
        if e.tag == "em":
            return "beautiful"
        return e

    html = traverse_and_replace("Hello <i>cruel</i> world", replace)
    assert html == "Hello really beautiful green world"


def test_traverse_and_replace_leading_trailing_recursive_4() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "i":
            return "really <em>beautiful</em> green"
        if e.tag == "em":
            return "beautiful"
        return e

    html = traverse_and_replace("<div>Hello <i>cruel</i> world</div>", replace)
    assert html == "<div>Hello really beautiful green world</div>"


def test_traverse_and_replace_leading_trailing_recursive_5() -> None:
    def replace(e) -> ElementReplacement:
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
    def replace(e) -> ElementReplacement:
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
    def replace(e) -> ElementReplacement:
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
    def replace(e) -> ElementReplacement:
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
    original_html = (
        "<div><pre><code>def hello():\n    print('Hello!')</code></pre></div>"
    )
    html = traverse_and_replace(
        original_html,
        lambda e: e,
    )
    assert html == original_html


def test_traverse_and_replace_attribute_quotes() -> None:
    def replace(e) -> ElementReplacement:
        if e.tag == "span":
            return "<strong attr1='a\"b' attr2=\"a'b\">Goodbye</strong>"
        return e

    html = traverse_and_replace(
        "<div><span>Hello</span></div>",
        replace,
    )
    assert html == '<div><strong attr1="a&quot;b" attr2="a\'b">Goodbye</strong></div>'
