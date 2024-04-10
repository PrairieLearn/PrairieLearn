from itertools import count

import chevron
import lxml.html
import prairielearn as pl

VALIGN_DEFAULT = "middle"
HALIGN_DEFAULT = "center"
CLIP_DEFAULT = True

VALIGN_VALUES = frozenset(("top", "middle", "center", "bottom"))
HALIGN_VALUES = frozenset(("left", "middle", "center", "right"))

# Percent to translate each alignment by.  This is relative to the top-left corner of the element.
ALIGNMENT_TO_PERC = {
    "top": "0%",
    "left": "0%",
    "middle": "-50%",
    "center": "-50%",
    "bottom": "-100%",
    "right": "-100%",
}


def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    num_backgrounds = 0
    for child in element:
        if isinstance(child, lxml.html.HtmlComment):
            continue

        if child.tag == "pl-location":
            pl.check_attribs(
                child,
                required_attribs=[],
                optional_attribs=["left", "right", "top", "bottom", "valign", "halign"],
            )

            if ("left" not in child.attrib and "right" not in child.attrib) or (
                "left" in child.attrib and "right" in child.attrib
            ):
                raise ValueError(
                    'pl-location requires exactly one of "left" or "right" attributes.'
                )

            if ("top" not in child.attrib and "bottom" not in child.attrib) or (
                "top" in child.attrib and "bottom" in child.attrib
            ):
                raise ValueError(
                    'pl-location requires exactly one of "top" or "bottom" attributes.'
                )

            valign = pl.get_string_attrib(child, "valign", VALIGN_DEFAULT)
            if valign not in VALIGN_VALUES:
                raise ValueError(f'Unknown vertical alignment "{valign}"')

            halign = pl.get_string_attrib(child, "halign", HALIGN_DEFAULT)
            if halign not in HALIGN_VALUES:
                raise ValueError(f'Unknown horizontal alignment "{halign}"')
        elif child.tag == "pl-background":
            pl.check_attribs(child, required_attribs=[], optional_attribs=[])
            num_backgrounds += 1
        else:
            raise ValueError(f'Unknown tag "{child.tag}" found as child of pl-overlay')

    if num_backgrounds == 0:
        pl.check_attribs(
            element, required_attribs=["width", "height"], optional_attribs=["clip"]
        )
    elif num_backgrounds == 1:
        pl.check_attribs(
            element, required_attribs=[], optional_attribs=["clip", "width", "height"]
        )
    else:
        raise ValueError(
            f"pl-overlay can have at most one <pl-background> child, found {num_backgrounds}."
        )


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    width = pl.get_float_attrib(element, "width", None)
    height = pl.get_float_attrib(element, "height", None)
    background = None

    # Assign layer index in order children are defined
    # Later defined elements will be placed on top of earlier ones
    locations = []
    z_index = count(0)
    for child in element:
        # Ignore comments
        if isinstance(child, lxml.html.HtmlComment):
            continue

        # Don't do any special processing for backgrounds
        if child.tag == "pl-background":
            background = pl.inner_html(child)
            continue

        # Otherwise, continue as normal
        valign = pl.get_string_attrib(child, "valign", VALIGN_DEFAULT)
        halign = pl.get_string_attrib(child, "halign", HALIGN_DEFAULT)

        left = pl.get_float_attrib(child, "left", None)
        right = pl.get_float_attrib(child, "right", None)
        top = pl.get_float_attrib(child, "top", None)
        bottom = pl.get_float_attrib(child, "bottom", None)

        # We allow both left/right and top/bottom but only set top and left
        # so we don't have to worry about all the alignment possibilities
        if left is not None:
            x = left
        else:
            x = width - right

        if top is not None:
            y = top
        else:
            y = height - bottom

        hoff = ALIGNMENT_TO_PERC[halign]
        voff = ALIGNMENT_TO_PERC[valign]

        transform = f"translate({hoff}, {voff})"
        style = (
            f"top: {y}px; left: {x}px; transform: {transform}; z-index: {next(z_index)}"
        )

        locations.append(
            {
                "html": pl.inner_html(child),
                "outer_style": style,
            }
        )

    html_params = {
        "width": width,
        "height": height,
        "locations": locations,
        "background": background,
        "clip": pl.get_boolean_attrib(element, "clip", CLIP_DEFAULT),
    }

    with open("pl-overlay.mustache", "r", encoding="utf-8") as f:
        return chevron.render(f, html_params).strip()
