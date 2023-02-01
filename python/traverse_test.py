from typing import List

from traverse import traverse_and_execute, traverse_and_replace


def test_traverse_and_execute():
    text: List[str] = []

    def capture_text(element):
        if element.text:
            text.append(element.text)

    traverse_and_execute("<p><i>Hello</i> <strong>world</strong></p>", capture_text)

    assert text == ["Hello", "world"]


def test_traverse_and_replace_none():
    html = traverse_and_replace("<p>Hello</p>", lambda e: None)
    assert html == "<p>Hello</p>"


def test_traverse_and_replace_empty():
    html = traverse_and_replace("<p>Hello</p>", lambda e: "")
    assert html == ""


def test_traverse_and_replace_identity():
    html = traverse_and_replace("<p>Hello</p>", lambda e: e)
    assert html == "<p>Hello</p>"


def test_traverse_and_replace_fragment():
    def replace(e):
        if e.tag == "p":
            return "<strong>Goodbye</strong>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<strong>Goodbye</strong>"


def test_traverse_and_replace_fragments():
    def replace(e):
        if e.tag == "p":
            return "<strong>Goodbye</strong><strong>Goodbye</strong>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<strong>Goodbye</strong><strong>Goodbye</strong>"


def traverse_and_replace_nested():
    def replace(e):
        if e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p><strong>Hello</strong></p>", replace)
    assert html == "<p><em>Goodbye</em></p>"


def test_traverse_and_replace_recursive():
    def replace(e):
        if e.tag == "p":
            return "<strong>Goodbye</strong>"
        elif e.tag == "strong":
            return "<em>Goodbye</em>"
        return e

    html = traverse_and_replace("<p>Hello</p>", replace)
    assert html == "<em>Goodbye</em>"
