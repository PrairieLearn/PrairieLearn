from traverse import traverse_and_replace


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
    html = traverse_and_replace("<p>Hello</p>", lambda e: "<p>Goodbye</p>")
    assert html == "<p>Goodbye</p>"


def test_traverse_and_replace_fragments():
    html = traverse_and_replace(
        "<p>Hello</p>", lambda e: "<p>Goodbye</p><p>Goodbye</p>"
    )
    assert html == "<p>Goodbye</p><p>Goodbye</p>"
