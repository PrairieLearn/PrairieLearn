# pyright: reportUnknownParameterType=false

import json
import math

import numpy as np
import prairielearn as pl
from defaults import drawing_defaults
from lxml.html import HtmlElement


def get_error_box(x1, y1, theta, tol, offset_forward, offset_backward):
    # Get the position of the anchor point of the vector
    rpos = np.array([x1, y1])
    # Defining the direction of the vector
    direction = np.array([math.cos(theta), math.sin(theta)])
    # Defining the error box limit in the direction of the vector
    max_forward = offset_forward + tol
    max_backward = offset_backward + tol
    wbox = max_backward + max_forward
    # Defining the error box limit in the direction perpendicular to the vector
    max_perp = tol
    hbox = 2 * max_perp
    pc = rpos - (wbox / 2 - max_forward) * direction
    return (pc, hbox, wbox, max_forward, max_backward)


def abserr(x, xapp):
    return np.abs(x - xapp)


def abserr_ang(ref, x):
    return np.abs(((np.abs(ref - x) + 180) % 360) - 180)


# Drawing Elements

elements = {}


class BaseElement:
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        return {}

    @staticmethod
    def is_gradable() -> bool:
        return False

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        return True

    @staticmethod
    def grading_name(element: HtmlElement) -> str | None:
        return None

    @staticmethod
    def validate_attributes() -> bool:
        return True

    @staticmethod
    def get_attributes() -> list[str]:
        """Return a list of attributes that the element may contain."""
        return []


class ControlledLine(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        offset_x = pl.get_float_attrib(el, "offset-tol-x", 0)
        offset_y = pl.get_float_attrib(el, "offset-tol-y", 0)
        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)

        # Defining the error boxes for end points
        wbox = 2 * tol + 2 * offset_x
        hbox = 2 * tol + 2 * offset_y

        return {
            "x1": pl.get_float_attrib(el, "x1", 20),
            "x2": pl.get_float_attrib(el, "x2", 40),
            "y1": pl.get_float_attrib(el, "y1", 40),
            "y2": pl.get_float_attrib(el, "y2", 40),
            "stroke": pl.get_color_attrib(el, "color", "red"),
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 4),
            "handleRadius": pl.get_float_attrib(el, "handle-radius", 6),
            "objectDrawErrorBox": obj_draw,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "offset_x": offset_x,
            "offset_y": offset_y,
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        ex1, ex2 = st["x1"], st["x2"]
        ey1, ey2 = st["y1"], st["y2"]
        rx1, rx2 = ref["x1"], ref["x2"]
        ry1, ry2 = ref["y1"], ref["y2"]
        # Check endpoints (any order)
        return (
            abserr(ex1, rx1) <= ref["offset_x"] + tol
            and abserr(ey1, ry1) <= ref["offset_y"] + tol
            and abserr(ex2, rx2) <= ref["offset_x"] + tol
            and abserr(ey2, ry2) <= ref["offset_y"] + tol
        ) or (
            abserr(ex1, rx2) <= ref["offset_x"] + tol
            and abserr(ey1, ry2) <= ref["offset_y"] + tol
            and abserr(ex2, rx1) <= ref["offset_x"] + tol
            and abserr(ey2, ry1) <= ref["offset_y"] + tol
        )

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "x3",
            "y3",
            "draw-error-box",
            "offset-tol-x",
            "offset-tol-y",
            "offset-control-tol-x",
            "offset-control-tol-y",
            "color",
            "stroke-width",
            "handle-radius",
        ]


class ControlledCurvedLine(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        offset_x = pl.get_float_attrib(el, "offset-tol-x", 0)
        offset_y = pl.get_float_attrib(el, "offset-tol-y", 0)
        offset_control_x = pl.get_float_attrib(el, "offset-control-tol-x", 0)
        offset_control_y = pl.get_float_attrib(el, "offset-control-tol-y", 0)
        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)

        # Defining the error boxes for end points
        wbox = 2 * tol + 2 * offset_x
        hbox = 2 * tol + 2 * offset_y
        # Defining the error box for the control point
        wbox_c = 2 * tol + 2 * offset_control_x
        hbox_c = 2 * tol + 2 * offset_control_y

        return {
            "x1": pl.get_float_attrib(el, "x1", 20),
            "y1": pl.get_float_attrib(el, "y1", 40),
            "x3": pl.get_float_attrib(el, "x2", 60),
            "y3": pl.get_float_attrib(el, "y2", 40),
            "x2": pl.get_float_attrib(el, "x3", 40),
            "y2": pl.get_float_attrib(el, "y3", 60),
            "stroke": pl.get_color_attrib(el, "color", "red"),
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 4),
            "handleRadius": pl.get_float_attrib(el, "handle-radius", 6),
            "objectDrawErrorBox": obj_draw,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "widthErrorBoxControl": wbox_c,
            "heightErrorBoxControl": hbox_c,
            "offset_x": offset_x,
            "offset_y": offset_y,
            "offset_control_x": offset_control_x,
            "offset_control_y": offset_control_y,
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        ex1, ex2, exm = st["x1"], st["x3"], st["x2"]
        ey1, ey2, eym = st["y1"], st["y3"], st["y2"]
        rx1, rx2, rxm = ref["x1"], ref["x3"], ref["x2"]
        ry1, ry2, rym = ref["y1"], ref["y3"], ref["y2"]
        # Check endpoints (any order) and the mid control point
        b1 = (
            abserr(ex1, rx1) <= ref["offset_x"] + tol
            and abserr(ey1, ry1) <= ref["offset_y"] + tol
            and abserr(ex2, rx2) <= ref["offset_x"] + tol
            and abserr(ey2, ry2) <= ref["offset_y"] + tol
            and abserr(exm, rxm) <= ref["offset_control_x"] + tol
            and abserr(eym, rym) <= ref["offset_control_y"] + tol
        )
        b2 = (
            abserr(ex1, rx2) <= ref["offset_x"] + tol
            and abserr(ey1, ry2) <= ref["offset_y"] + tol
            and abserr(ex2, rx1) <= ref["offset_x"] + tol
            and abserr(ey2, ry1) <= ref["offset_y"] + tol
            and abserr(exm, rxm) <= ref["offset_control_x"] + tol
            and abserr(eym, rym) <= ref["offset_control_y"] + tol
        )
        return b1 or b2

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "x3",
            "y3",
            "draw-error-box",
            "offset-tol-x",
            "offset-tol-y",
            "offset-control-tol-x",
            "offset-control-tol-y",
            "color",
            "stroke-width",
            "handle-radius",
        ]


class Roller(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "brown1")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "x1": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "y1": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "height": pl.get_float_attrib(el, "height", drawing_defaults["height"]),
            "width": pl.get_float_attrib(el, "width", drawing_defaults["width"]),
            "angle": pl.get_float_attrib(el, "angle", drawing_defaults["angle"]),
            "label": pl.get_string_attrib(el, "label", drawing_defaults["label"]),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "color": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": json.loads(pl.get_string_attrib(el, "draw-pin", "true")),
            "drawGround": json.loads(pl.get_string_attrib(el, "draw-ground", "true")),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "height",
            "width",
            "angle",
            "draw-pin",
            "draw-ground",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class Clamped(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "black")
        return {
            "x1": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "y1": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "height": pl.get_float_attrib(el, "height", drawing_defaults["height"]),
            "width": pl.get_float_attrib(el, "width", drawing_defaults["width"]),
            "angle": pl.get_float_attrib(el, "angle", drawing_defaults["angle"]),
            "label": pl.get_string_attrib(el, "label", drawing_defaults["label"]),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "color": color,
            "stroke": pl.get_string_attrib(el, "stroke-color", "black"),
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "height",
            "width",
            "angle",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-width",
        ]


class FixedPin(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "brown1")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        obj = {
            "x1": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "y1": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "height": pl.get_float_attrib(el, "height", drawing_defaults["height"]),
            "width": pl.get_float_attrib(el, "width", drawing_defaults["width"]),
            "angle": pl.get_float_attrib(el, "angle", drawing_defaults["angle"]),
            "label": pl.get_string_attrib(el, "label", drawing_defaults["label"]),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "color": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": json.loads(pl.get_string_attrib(el, "draw-pin", "true")),
            "drawGround": json.loads(pl.get_string_attrib(el, "draw-ground", "true")),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }
        return obj

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "height",
            "width",
            "angle",
            "draw-pin",
            "draw-ground",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class Rod(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "white")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "height": pl.get_float_attrib(el, "width", drawing_defaults["width-rod"]),
            "x1": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "y1": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "label1": pl.get_string_attrib(el, "label1", drawing_defaults["label"]),
            "offsetx1": pl.get_float_attrib(
                el, "offsetx1", drawing_defaults["offsetx"]
            ),
            "offsety1": pl.get_float_attrib(
                el, "offsety1", drawing_defaults["offsety"]
            ),
            "x2": pl.get_float_attrib(el, "x2", drawing_defaults["x2"]),
            "y2": pl.get_float_attrib(el, "y2", drawing_defaults["y2"]),
            "label2": pl.get_string_attrib(el, "label2", drawing_defaults["label"]),
            "offsetx2": pl.get_float_attrib(
                el, "offsetx2", drawing_defaults["offsetx"]
            ),
            "offsety2": pl.get_float_attrib(
                el, "offsety2", drawing_defaults["offsety"]
            ),
            "color": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": json.loads(pl.get_string_attrib(el, "draw-pin", "true")),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "width",
            "draw-pin",
            "label1",
            "offsetx1",
            "offsety1",
            "label2",
            "offsetx2",
            "offsety2",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class CollarRod(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        w = pl.get_float_attrib(el, "width", 20)
        color = pl.get_color_attrib(el, "color", "white")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "height": w,
            "x1": pl.get_float_attrib(el, "x1", 40),
            "y1": pl.get_float_attrib(el, "y1", 40),
            "collar1": pl.get_boolean_attrib(el, "draw-collar-end1", True),
            "w1": pl.get_float_attrib(el, "w1", 1.5 * w),
            "h1": pl.get_float_attrib(el, "h1", 2 * w),
            "label1": pl.get_string_attrib(el, "label1", ""),
            "offsetx1": pl.get_float_attrib(el, "offsetx1", 2),
            "offsety1": pl.get_float_attrib(el, "offsety1", 2),
            "x2": pl.get_float_attrib(el, "x2", 100),
            "y2": pl.get_float_attrib(el, "y2", 40),
            "w2": pl.get_float_attrib(el, "w2", 1.5 * w),
            "h2": pl.get_float_attrib(el, "h2", 2 * w),
            "collar2": pl.get_boolean_attrib(el, "draw-collar-end2", False),
            "label2": pl.get_string_attrib(el, "label2", ""),
            "offsetx2": pl.get_float_attrib(el, "offsetx2", 2),
            "offsety2": pl.get_float_attrib(el, "offsety2", 2),
            "color": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": json.loads(pl.get_string_attrib(el, "draw-pin", "true")),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "width",
            "draw-pin",
            "label1",
            "offsetx1",
            "offsety1",
            "label2",
            "offsetx2",
            "offsety2",
            "draw-collar-end1",
            "w1",
            "h1",
            "draw-collar-end2",
            "w2",
            "h2",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class ThreePointRod(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "white")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        x1 = pl.get_float_attrib(el, "x1", 40)
        y1 = pl.get_float_attrib(el, "y1", 100)
        x2 = pl.get_float_attrib(el, "x2", 100)
        y2 = pl.get_float_attrib(el, "y2", 100)
        x3 = pl.get_float_attrib(el, "x3", 100)
        y3 = pl.get_float_attrib(el, "y3", 140)
        return {
            "height": pl.get_float_attrib(el, "width", 20),
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "x3": x3,
            "y3": y3,
            "label1": pl.get_string_attrib(el, "label1", ""),
            "offsetx1": pl.get_float_attrib(el, "offsetx1", 0),
            "offsety1": pl.get_float_attrib(el, "offsety1", -20),
            "label2": pl.get_string_attrib(el, "label2", ""),
            "offsetx2": pl.get_float_attrib(el, "offsetx2", 0),
            "offsety2": pl.get_float_attrib(el, "offsety2", -20),
            "label3": pl.get_string_attrib(el, "label3", ""),
            "offsetx3": pl.get_float_attrib(el, "offsetx3", 0),
            "offsety3": pl.get_float_attrib(el, "offsety3", -20),
            "color": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": json.loads(pl.get_string_attrib(el, "draw-pin", "true")),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "x3",
            "y3",
            "width",
            "draw-pin",
            "label1",
            "offsetx1",
            "offsety1",
            "label2",
            "offsetx2",
            "offsety2",
            "label3",
            "offsetx3",
            "offsety3",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class FourPointRod(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "white")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        x1 = pl.get_float_attrib(el, "x1", 40)
        y1 = pl.get_float_attrib(el, "y1", 100)
        x2 = pl.get_float_attrib(el, "x2", 100)
        y2 = pl.get_float_attrib(el, "y2", 100)
        x3 = pl.get_float_attrib(el, "x3", 100)
        y3 = pl.get_float_attrib(el, "y3", 160)
        x4 = pl.get_float_attrib(el, "x4", 140)
        y4 = pl.get_float_attrib(el, "y4", 60)

        return {
            "height": pl.get_float_attrib(el, "width", 20),
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "x3": x3,
            "y3": y3,
            "x4": x4,
            "y4": y4,
            "label1": pl.get_string_attrib(el, "label1", ""),
            "offsetx1": pl.get_float_attrib(el, "offsetx1", 0),
            "offsety1": pl.get_float_attrib(el, "offsety1", -20),
            "label2": pl.get_string_attrib(el, "label2", ""),
            "offsetx2": pl.get_float_attrib(el, "offsetx2", 0),
            "offsety2": pl.get_float_attrib(el, "offsety2", -20),
            "label3": pl.get_string_attrib(el, "label3", ""),
            "offsetx3": pl.get_float_attrib(el, "offsetx3", 0),
            "offsety3": pl.get_float_attrib(el, "offsety3", -20),
            "label4": pl.get_string_attrib(el, "label4", ""),
            "offsetx4": pl.get_float_attrib(el, "offsetx4", 0),
            "offsety4": pl.get_float_attrib(el, "offsety4", -20),
            "color": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": json.loads(pl.get_string_attrib(el, "draw-pin", "true")),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "x3",
            "y3",
            "x4",
            "y4",
            "width",
            "draw-pin",
            "label1",
            "offsetx1",
            "offsety1",
            "label2",
            "offsetx2",
            "offsety2",
            "label3",
            "offsetx3",
            "offsety3",
            "label4",
            "offsetx4",
            "offsety4",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class Pulley(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "gray")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        r = pl.get_float_attrib(el, "radius", 20)
        x1 = pl.get_float_attrib(el, "x1", 100)
        y1 = pl.get_float_attrib(el, "y1", 100)
        x2 = pl.get_float_attrib(el, "x2", 140)
        y2 = pl.get_float_attrib(el, "y2", 140)
        x3 = pl.get_float_attrib(el, "x3", 40)
        y3 = pl.get_float_attrib(el, "y3", 130)
        longer = pl.get_boolean_attrib(el, "alternative-path", "false")

        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "x3": x3,
            "y3": y3,
            "longer": longer,
            "radius": r,
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 2),
            "offsety": pl.get_float_attrib(el, "offsety", 2),
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "fill": color,
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "x3",
            "y3",
            "alternative-path",
            "radius",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-color",
            "stroke-width",
        ]


class Vector(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "red3")
        anchor_is_tail = pl.get_boolean_attrib(el, "anchor-is-tail", True)
        # This is the anchor point for Grading
        x1 = pl.get_float_attrib(el, "x1", 30)
        y1 = pl.get_float_attrib(el, "y1", 10)
        # This is the end point used for plotting
        left = x1
        top = y1
        w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
        angle = pl.get_float_attrib(el, "angle", 0)
        theta = angle * math.pi / 180
        if not anchor_is_tail:
            left -= w * math.cos(theta)
            top -= w * math.sin(theta)
        # Error box for grading
        disregard_sense = pl.get_boolean_attrib(el, "disregard-sense", False)
        if disregard_sense:
            offset_forward_default = w
        else:
            offset_forward_default = 0
        offset_forward = pl.get_float_attrib(
            el, "offset-forward", offset_forward_default
        )
        offset_backward = pl.get_float_attrib(el, "offset-backward", w)

        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)
        pc, hbox, wbox, _, _ = get_error_box(
            x1, y1, theta, tol, offset_forward, offset_backward
        )

        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        return {
            "left": left,
            "top": top,
            "x1": x1,
            "y1": y1,
            "width": w,
            "angle": angle,
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 2),
            "offsety": pl.get_float_attrib(el, "offsety", 2),
            "stroke": color,
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 3),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 1),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 1),
            "drawStartArrow": False,
            "drawEndArrow": True,
            "originY": "center",
            "trueHandles": ["mtr"],
            "disregard_sense": disregard_sense,
            "optional_grading": pl.get_boolean_attrib(el, "optional-grading", False),
            "objectDrawErrorBox": obj_draw,
            "XcenterErrorBox": pc[0] if pc is not None else pc,
            "YcenterErrorBox": pc[1] if pc is not None else pc,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "offset_forward": offset_forward,
            "offset_backward": offset_backward,
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        epos = np.array([st["left"], st["top"]]).astype(np.float64)
        eang = st["angle"]
        elen = st["width"]

        # Adjust position if the vector is centered
        # I think this will always be true, since this attribute cannot be modified by instructor or student
        # maybe consider removing this check?
        if st.get("originX", "") == "center":
            eang_rad = eang * (np.pi / 180.0)
            st_dir = np.array([np.cos(eang_rad), np.sin(eang_rad)])
            epos -= st_dir * np.float64(elen) / 2

        # Get the position of the anchor point for the correct answer
        rpos = np.array([ref["x1"], ref["y1"]])

        # Get the angle for the correct answer
        rang = ref["angle"]
        rang_bwd = ref["angle"] + 180
        rang_rad = rang * (np.pi / 180.0)

        # Defining the error box limit in the direction of the vector
        max_backward = ref["offset_backward"] + tol
        max_forward = ref["offset_forward"] + tol

        # Check the angles
        error_fwd = abserr_ang(rang, eang)
        error_bwd = abserr_ang(rang_bwd, eang)

        if ref["disregard_sense"]:
            if error_fwd > angtol and error_bwd > angtol:
                return False
        elif error_fwd > angtol:
            return False

        # Get position of student answer relative to reference answer
        basis = np.array([
            [np.cos(rang_rad), -np.sin(rang_rad)],
            [np.sin(rang_rad), np.cos(rang_rad)],
        ]).T
        epos_rel = basis @ (epos - rpos)
        rely, relx = epos_rel

        return abs(relx) <= tol and -max_backward <= rely <= max_forward

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "anchor-is-tail",
            "width",
            "angle",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
            "disregard-sense",
            "draw-error-box",
            "offset-forward",
            "offset-backward",
            "optional-grading",
        ]


class PairedVector(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        color = pl.get_color_attrib(el, "color", "red3")
        anchor_is_tail = pl.get_boolean_attrib(el, "anchor-is-tail", True)
        # This is the anchor point for Grading
        x1 = pl.get_float_attrib(el, "x1", 2 * grid_size)
        y1 = pl.get_float_attrib(el, "y1", grid_size)

        x2 = pl.get_float_attrib(el, "x2", 3 * grid_size)
        y2 = pl.get_float_attrib(el, "y2", 2 * grid_size)

        # This is the end point used for plotting
        left1 = x1
        top1 = y1

        left2 = x2
        top2 = y2

        # common arrow length
        w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])

        angle1 = pl.get_float_attrib(el, "angle1", 0)
        angle2 = pl.get_float_attrib(el, "angle2", 0)
        theta1 = angle1 * math.pi / 180
        theta2 = angle2 * math.pi / 180
        if not anchor_is_tail:
            left1 -= w * math.cos(theta1)
            left2 -= w * math.cos(theta1)
            top1 -= w * math.sin(theta2)
            top2 -= w * math.sin(theta2)

        # Error box for grading; uses disregard-sense True by default (unlike pl-vector)
        disregard_sense = pl.get_boolean_attrib(el, "disregard-sense", True)
        if disregard_sense:
            offset_forward_default = w
        else:
            offset_forward_default = 0
        offset_forward = pl.get_float_attrib(
            el, "offset-forward", offset_forward_default
        )
        offset_backward = pl.get_float_attrib(el, "offset-backward", w)

        tol = pl.get_float_attrib(el, "tol", grid_size / 2)
        pc1, hbox1, wbox1, _, _ = get_error_box(
            x1, y1, theta1, tol, offset_forward, offset_backward
        )
        pc2, hbox2, wbox2, _, _ = get_error_box(
            x2, y2, theta2, tol, offset_forward, offset_backward
        )

        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        return {
            "left1": left1,
            "top1": top1,
            "left2": left2,
            "top2": top2,
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "width": w,
            "angle1": angle1,
            "angle2": angle2,
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 2),
            "offsety": pl.get_float_attrib(el, "offsety", 2),
            "stroke": color,
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 3),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 1),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 1),
            "drawStartArrow": False,
            "drawEndArrow": True,
            "originY": "center",
            "trueHandles": ["mtr"],
            "disregard_sense": disregard_sense,
            "optional_grading": pl.get_boolean_attrib(el, "optional-grading", False),
            "objectDrawErrorBox": obj_draw,
            "XcenterErrorBox1": pc1[0] if pc1 is not None else pc1,
            "YcenterErrorBox1": pc1[1] if pc1 is not None else pc1,
            "XcenterErrorBox2": pc2[0] if pc2 is not None else pc2,
            "YcenterErrorBox2": pc2[1] if pc2 is not None else pc2,
            "widthErrorBox1": wbox1,
            "heightErrorBox1": hbox1,
            "widthErrorBox2": wbox2,
            "heightErrorBox2": hbox2,
            "offset_forward": offset_forward,
            "offset_backward": offset_backward,
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        ref2 = ref.copy()
        st2 = st.copy()
        dup_attrs = [
            "top",
            "left",
            "angle",
            "XcenterErrorBox",
            "YcenterErrorBox",
            "widthErrorBox",
            "heightErrorBox",
        ]
        ref2["x3"] = ref2["x2"]
        ref2["y3"] = ref2["y2"]
        st2["x3"] = st2["x2"]
        st2["y3"] = st2["y2"]
        ref2["x2"] = ref2["x1"]
        ref2["y2"] = ref2["y1"]
        st2["x2"] = st2["x1"]
        st2["y2"] = st2["y1"]

        poss = [[False for i in range(2)] for j in range(2)]
        counter = 0
        for i in range(2):
            for j in range(2):
                for attr in dup_attrs:
                    ref2[attr] = ref2[attr + str(i + 1)]
                    st2[attr] = st2[attr + str(j + 1)]
                for attr in ["x", "y"]:
                    ref2[attr + "1"] = ref2[attr + str(i + 2)]
                    st2[attr + "1"] = st2[attr + str(j + 2)]
                poss[i][j] = Vector.grade(ref2, st2, tol, angtol)
                counter += 1
        angdiff = abs(st2["angle1"] - st2["angle2"])
        angdiff = abs(angdiff - 180)
        return (
            (poss[0][1] and poss[1][0]) or (poss[0][0] and poss[1][1])
        ) and angdiff < 2 * angtol

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "anchor-is-tail",
            "width",
            "angle1",
            "angle2",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
            "disregard-sense",
            "draw-error-box",
            "offset-forward",
            "offset-backward",
            "optional-grading",
            "weight",
        ]


class DoubleHeadedVector(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        obj = Vector.generate(el, data)
        obj["type"] = "pl-double-headed-vector"
        return obj

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "anchor-is-tail",
            "width",
            "angle",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
            "disregard-sense",
            "draw-error-box",
            "offset-forward",
            "offset-backward",
            "optional-grading",
        ]


class ArcVector(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        disregard_sense = pl.get_boolean_attrib(el, "disregard-sense", False)
        color = pl.get_color_attrib(el, "color", "purple")
        clockwise_direction = pl.get_boolean_attrib(el, "clockwise-direction", True)
        if clockwise_direction:
            draw_start_arrow = False
            draw_end_arrow = True
        else:
            draw_start_arrow = True
            draw_end_arrow = False
        # Error box for grading
        x1 = pl.get_float_attrib(el, "x1", 40)
        y1 = pl.get_float_attrib(el, "y1", 40)

        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        offset_forward = pl.get_float_attrib(el, "offset-forward", 0)
        offset_backward = pl.get_float_attrib(el, "offset-backward", 0)

        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)
        pc, hbox, wbox, _, _ = get_error_box(
            x1, y1, 0, tol, offset_forward, offset_backward
        )

        return {
            "left": x1,
            "top": y1,
            "angle": 0,
            "radius": pl.get_float_attrib(el, "radius", 30),
            "startAngle": pl.get_float_attrib(el, "start-angle", 0),
            "endAngle": pl.get_float_attrib(el, "end-angle", 210),
            "drawCenterPoint": json.loads(
                pl.get_string_attrib(el, "draw-center", "true")
            ),
            "drawStartArrow": draw_start_arrow,
            "drawEndArrow": draw_end_arrow,
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 0),
            "offsety": pl.get_float_attrib(el, "offsety", 0),
            "stroke": color,
            "fill": color,
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 3),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 1),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 1),
            "disregard_sense": disregard_sense,
            "optional_grading": pl.get_boolean_attrib(el, "optional-grading", False),
            "objectDrawErrorBox": obj_draw,
            "XcenterErrorBox": pc[0] if pc is not None else pc,
            "YcenterErrorBox": pc[1] if pc is not None else pc,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "offset_forward": offset_forward,
            "offset_backward": offset_backward,
            "originY": "center",
            "selectable": drawing_defaults["selectable"],
            "clockwiseDirection": clockwise_direction,
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        epos = np.array([st["left"], st["top"]]).astype(np.float64)
        st_start_arrow = st["drawStartArrow"]

        rpos = np.array([ref["left"], ref["top"]])
        ref_start_arrow = ref["drawStartArrow"]

        # Check if correct position
        relx, rely = epos - rpos
        if relx > tol or relx < -tol or rely > tol or rely < -tol:
            return False

        # Check if correct orientation
        return ref["disregard_sense"] or st_start_arrow == ref_start_arrow

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "radius",
            "start-angle",
            "end-angle",
            "draw-center",
            "clockwise-direction",
            "label",
            "offsetx",
            "offsety",
            "color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
            "disregard-sense",
            "draw-error-box",
            "anchor-is-tail",
        ]


class DistributedLoad(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "red3")
        anchor_is_tail = pl.get_boolean_attrib(el, "anchor-is-tail", True)
        # This is the anchor point for Grading
        x1 = pl.get_float_attrib(el, "x1", 30)
        y1 = pl.get_float_attrib(el, "y1", 10)
        # This is the end point used for plotting
        left = x1
        top = y1
        w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
        w1 = pl.get_float_attrib(el, "w1", drawing_defaults["force-width"])
        w2 = pl.get_float_attrib(el, "w2", drawing_defaults["force-width"])
        wmax = max(w1, w2)
        angle = pl.get_float_attrib(el, "angle", 0)
        theta = angle * math.pi / 180
        if not anchor_is_tail:
            left += wmax * math.sin(theta)
            top -= wmax * math.cos(theta)
        # Error box for grading
        disregard_sense = pl.get_boolean_attrib(el, "disregard-sense", False)
        if disregard_sense:
            offset_forward_default = 1.1 * wmax
        else:
            offset_forward_default = 0
        offset_forward = pl.get_float_attrib(
            el, "offset-forward", offset_forward_default
        )
        offset_backward = pl.get_float_attrib(el, "offset-backward", 1.1 * wmax)

        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)
        pc, wbox, hbox, _, _ = get_error_box(
            x1, y1, theta + math.pi / 2, tol, offset_forward, offset_backward
        )

        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        return {
            "left": left,
            "top": top,
            "x1": x1,
            "y1": y1,
            "angle": angle,
            "range": w,
            "spacing": pl.get_float_attrib(el, "spacing", 20),
            "w1": w1,
            "w2": w2,
            "label1": pl.get_string_attrib(el, "label1", ""),
            "offsetx1": pl.get_float_attrib(el, "offsetx1", 2),
            "offsety1": pl.get_float_attrib(el, "offsety1", 2),
            "label2": pl.get_string_attrib(el, "label2", ""),
            "offsetx2": pl.get_float_attrib(el, "offsetx2", 2),
            "offsety2": pl.get_float_attrib(el, "offsety2", 2),
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 2),
            "offsety": pl.get_float_attrib(el, "offsety", 2),
            "stroke": color,
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 3),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 2),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 3),
            "drawStartArrow": False,
            "drawEndArrow": True,
            "anchor_is_tail": pl.get_string_attrib(el, "anchor-is-tail", "true"),
            "trueHandles": ["mtr"],
            "disregard_sense": disregard_sense,
            "optional_grading": pl.get_boolean_attrib(el, "optional-grading", False),
            "objectDrawErrorBox": obj_draw,
            "XcenterErrorBox": pc[0] if pc is not None else pc,
            "YcenterErrorBox": pc[1] if pc is not None else pc,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "offset_forward": offset_forward,
            "offset_backward": offset_backward,
            "selectable": drawing_defaults["selectable"],
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        epos = np.array([st["left"], st["top"]]).astype(np.float64)
        eang = st["angle"]
        elen = st["range"]
        ew1 = st["w1"]
        ew2 = st["w2"]

        # Get the position of the anchor point for the correct answer
        rpos = np.array([ref["x1"], ref["y1"]])
        # Get the angle for the correct answer
        rang = ref["angle"]
        rang_bwd = ref["angle"] + 180
        rang_rad = rang * (np.pi / 180.0)
        rlen = ref["range"]
        rw1 = ref["w1"]
        rw2 = ref["w2"]
        # Defining the error box limit in the direction of the vector
        max_backward = ref["offset_backward"] + tol
        max_forward = ref["offset_forward"] + tol

        # Check the angles
        error_fwd = abserr_ang(rang, eang)
        error_bwd = abserr_ang(rang_bwd, eang)

        if ref["disregard_sense"]:
            if error_fwd > angtol and error_bwd > angtol:
                return False
        elif error_fwd > angtol:
            return False

        # Check width
        if abserr(elen, rlen) > tol:
            return False

        # Get position of student answer relative to reference answer
        basis = np.array([
            [-np.sin(rang_rad), -np.cos(rang_rad)],
            [np.cos(rang_rad), -np.sin(rang_rad)],
        ]).T
        epos_rel = basis @ (epos - rpos)
        rely, relx = epos_rel
        if relx > tol or relx < -tol or rely > max_forward or rely < -max_backward:
            return False

        # Check the distribution
        if rw1 == rw2:  # This is an uniform load
            if ew1 != ew2:
                return False
        else:
            if st.get("flipped"):
                ew1, ew2 = ew2, ew1
            if (rw1 < rw2 and ew1 > ew2) or (rw1 > rw2 and ew1 < ew2):
                return False

        return True

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "anchor-is-tail",
            "width",
            "spacing",
            "w1",
            "w2",
            "angle",
            "label1",
            "offsetx1",
            "offsety1",
            "label2",
            "offsetx2",
            "offsety2",
            "color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
            "disregard-sense",
            "draw-error-box",
            "offset-forward",
            "offset-backward",
        ]


class Point(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "black")
        # Error box for grading
        x1 = pl.get_float_attrib(el, "x1", 40)
        y1 = pl.get_float_attrib(el, "y1", 40)

        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        offset_forward = pl.get_float_attrib(el, "offset-forward", 0)
        offset_backward = pl.get_float_attrib(el, "offset-backward", 0)

        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)
        pc, hbox, wbox, _, _ = get_error_box(
            x1, y1, 0, tol, offset_forward, offset_backward
        )

        return {
            "left": pl.get_float_attrib(el, "x1", 20),
            "top": pl.get_float_attrib(el, "y1", 20),
            "radius": pl.get_float_attrib(el, "radius", drawing_defaults["point-size"]),
            "objectDrawErrorBox": obj_draw,
            "XcenterErrorBox": pc[0] if pc is not None else pc,
            "YcenterErrorBox": pc[1] if pc is not None else pc,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "offset_forward": offset_forward,
            "offset_backward": offset_backward,
            "label": pl.get_string_attrib(el, "label", drawing_defaults["label"]),
            "offsetx": pl.get_float_attrib(el, "offsetx", 5),
            "offsety": pl.get_float_attrib(el, "offsety", 5),
            "originX": "center",
            "originY": "center",
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "fill": color,
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def is_gradable() -> bool:
        return True

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        epos = np.array([st["left"], st["top"]]).astype(np.float64)
        rpos = np.array([ref["left"], ref["top"]])
        # Check if correct position
        relx, rely = epos - rpos
        return abs(relx) <= tol and abs(rely) <= tol

    @staticmethod
    def get_attributes() -> list[str]:
        return ["x1", "y1", "radius", "label", "offsetx", "offsety", "opacity", "color"]


class Coordinates(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "black")
        return {
            "left": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "top": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "width": pl.get_float_attrib(el, "width", drawing_defaults["width"]),
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", -16),
            "offsety": pl.get_float_attrib(el, "offsety", -10),
            "labelx": pl.get_string_attrib(el, "label-x", "x"),
            "labely": pl.get_string_attrib(el, "label-y", "y"),
            "offsetx_label_x": pl.get_float_attrib(el, "offsetx-label-x", 0),
            "offsety_label_x": pl.get_float_attrib(el, "offsety-label-x", 0),
            "offsetx_label_y": pl.get_float_attrib(el, "offsetx-label-y", -20),
            "offsety_label_y": pl.get_float_attrib(el, "offsety-label-y", -10),
            "stroke": color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "angle": pl.get_float_attrib(el, "angle", 0),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 1),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 1),
            "drawStartArrow": False,
            "drawEndArrow": True,
            "originY": "center",
            "selectable": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "label",
            "offsetx",
            "offsety",
            "label-x",
            "offsetx-label-x",
            "offsety-label-x",
            "label-y",
            "offsetx-label-y",
            "offsety-label-y",
            "color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
        ]


class Dimensions(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "stroke-color", "black")
        offset = pl.get_float_attrib(el, "dim-offset", 0)
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" not in el.attrib:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"] / 2)
            ang = pl.get_float_attrib(el, "angle", drawing_defaults["angle"])
            ang_rad = ang * math.pi / 180
            x2 = x1 + w * math.cos(ang_rad)
            y2 = y1 + w * math.sin(ang_rad)
        else:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2", y1)
            ang_rad = math.atan2(y2 - y1, x2 - x1)

        if "dim-offset-angle" in el.attrib:
            ang = pl.get_float_attrib(el, "dim-offset-angle")
            ang_rad = ang * math.pi / 180

        e1 = np.array([math.cos(ang_rad), math.sin(ang_rad)])
        e2 = np.array([-math.sin(ang_rad), math.cos(ang_rad)])
        r1 = np.array([x1, y1])
        r2 = np.array([x2, y2])
        r12 = r2 - r1

        r1d = r1 + offset * e2
        r2d = r1d + np.inner(r12, e1) * e1
        rlabel = r1d + 0.5 * np.inner(r12, e1) * e1 + 10 * e2

        return {
            "x1ref": x1,
            "y1ref": y1,
            "x2ref": x2,
            "y2ref": y2,
            "x1d": float(r1d[0]),
            "y1d": float(r1d[1]),
            "x2d": float(r2d[0]),
            "y2d": float(r2d[1]),
            "stroke": color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"] / 2
            ),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 1.5),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 1.5),
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 0),
            "offsety": pl.get_float_attrib(el, "offsety", 0),
            "xlabel": float(rlabel[0]),
            "ylabel": float(rlabel[1]),
            "drawStartArrow": json.loads(
                pl.get_string_attrib(el, "draw-start-arrow", "true")
            ),
            "drawEndArrow": json.loads(
                pl.get_string_attrib(el, "draw-end-arrow", "true")
            ),
            "startSupportLine": pl.get_boolean_attrib(el, "start-support-line", False),
            "endSupportLine": pl.get_boolean_attrib(el, "end-support-line", False),
            "originY": "center",
            "selectable": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "x2",
            "y2",
            "dim-offset",
            "dim-offset-angle",
            "start-support-line",
            "end-support-line",
            "label",
            "offsetx",
            "offsety",
            "stroke-color",
            "stroke-width",
            "draw-start-arrow",
            "draw-end-arrow",
            "arrow-head-width",
            "arrow-head-length",
        ]


class ArcDimensions(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "left": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "top": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "angle": pl.get_float_attrib(el, "angle", drawing_defaults["angle"]),
            "radius": pl.get_float_attrib(el, "radius", drawing_defaults["radius"]),
            "startAngle": pl.get_float_attrib(
                el, "start-angle", drawing_defaults["angle"]
            ),
            "endAngle": pl.get_float_attrib(
                el, "end-angle", drawing_defaults["end-angle"]
            ),
            "drawCenterPoint": pl.get_boolean_attrib(el, "draw-center", False),
            "drawStartArrow": pl.get_boolean_attrib(el, "draw-start-arrow", False),
            "drawEndArrow": pl.get_boolean_attrib(el, "draw-end-arrow", True),
            "startSupportLine": pl.get_boolean_attrib(el, "start-support-line", False),
            "endSupportLine": pl.get_boolean_attrib(el, "end-support-line", False),
            "label": pl.get_string_attrib(el, "label", drawing_defaults["label"]),
            "offsetx": pl.get_float_attrib(el, "offsetx", 0),
            "offsety": pl.get_float_attrib(el, "offsety", 0),
            "stroke": color,
            "fill": color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"] / 2
            ),
            "arrowheadWidthRatio": pl.get_float_attrib(el, "arrow-head-width", 1),
            "arrowheadOffsetRatio": pl.get_float_attrib(el, "arrow-head-length", 1),
            "originY": "center",
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "radius",
            "start-angle",
            "end-angle",
            "start-support-line",
            "end-support-line",
            "draw-center",
            "draw-start-arrow",
            "draw-end-arrow",
            "label",
            "offsetx",
            "offsety",
            "stroke-color",
            "stroke-width",
            "arrow-head-width",
            "arrow-head-length",
        ]


class Rectangle(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "green1")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "left": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "top": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "width": pl.get_float_attrib(el, "width", drawing_defaults["width"]),
            "height": pl.get_float_attrib(el, "height", drawing_defaults["height"]),
            "angle": pl.get_float_attrib(el, "angle", drawing_defaults["angle"]),
            "originX": "center",
            "originY": "center",
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "fill": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"] / 2
            ),
            "strokeUniform": True,
            "selectable": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
            "evented": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "height",
            "width",
            "angle",
            "opacity",
            "color",
            "stroke-color",
            "stroke-width",
            "selectable",
        ]


class Triangle(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "red1")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "p1": {
                "x": pl.get_float_attrib(el, "x1", 40),
                "y": pl.get_float_attrib(el, "y1", 40),
            },
            "p2": {
                "x": pl.get_float_attrib(el, "x2", 60),
                "y": pl.get_float_attrib(el, "y2", 40),
            },
            "p3": {
                "x": pl.get_float_attrib(el, "x3", 40),
                "y": pl.get_float_attrib(el, "y3", 20),
            },
            "fill": color,
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"] / 2
            ),
            "strokeUniform": True,
            "originX": "center",
            "originY": "center",
            "selectable": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
            "evented": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "x2",
            "y2",
            "x3",
            "y3",
            "color",
            "opacity",
            "stroke-color",
            "stroke-width",
            "selectable",
        ]


class Circle(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        color = pl.get_color_attrib(el, "color", "grey")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "left": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "top": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "radius": pl.get_float_attrib(el, "radius", drawing_defaults["radius"]),
            "label": pl.get_string_attrib(el, "label", drawing_defaults["label"]),
            "offsetx": pl.get_float_attrib(el, "offsetx", 5),
            "offsety": pl.get_float_attrib(el, "offsety", 5),
            "originX": "center",
            "originY": "center",
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "stroke": stroke_color,
            "fill": color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"] / 2
            ),
            "strokeUniform": True,
            "selectable": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
            "evented": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
            "scaling": True,
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "radius",
            "opacity",
            "color",
            "stroke-color",
            "stroke-width",
            "label",
            "offsetx",
            "offsety",
            "selectable",
        ]


class Polygon(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        pointlist = json.loads(
            pl.get_string_attrib(
                el,
                "plist",
                '[{"x": 66.21260699999999, "y": 82.746078}, {"x": 25.880586, "y": 78.50701}, {"x": 17.448900000000002, "y": 38.839035}, {"x": 52.569852, "y": 18.561946}, {"x": 82.707481, "y": 45.697991}]',
            )
        )
        color = pl.get_color_attrib(el, "color", "white")
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "pointlist": pointlist,
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "fill": color,
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 1),
            "strokeUniform": True,
            "selectable": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
            "evented": pl.get_boolean_attrib(
                el, "selectable", drawing_defaults["selectable"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "plist",
            "opacity",
            "color",
            "stroke-color",
            "stroke-width",
            "selectable",
        ]


class Spring(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", drawing_defaults["angle"])
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "height": pl.get_float_attrib(el, "height", drawing_defaults["height"]),
            "dx": pl.get_float_attrib(el, "interval", 10),
            "originX": "center",
            "originY": "center",
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": pl.get_boolean_attrib(el, "draw-pin", False),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "height",
            "interval",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "draw-pin",
        ]


class Coil(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", 80)
            angle = pl.get_float_attrib(el, "angle", drawing_defaults["angle"])
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "height": pl.get_float_attrib(el, "height", 30),
            "originX": "center",
            "originY": "center",
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "drawPin": pl.get_boolean_attrib(el, "draw-pin", False),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "height",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "draw-pin",
        ]


class Line(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        if "dashed-size" in el.attrib:
            dashed_array = [
                pl.get_float_attrib(el, "dashed-size"),
                pl.get_float_attrib(el, "dashed-size"),
            ]
        else:
            dashed_array = None
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "originX": "center",
            "originY": "center",
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "strokeDashArray": dashed_array,
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "x2",
            "y2",
            "opacity",
            "stroke-color",
            "stroke-width",
            "dashed-size",
        ]


class Arc(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        theta1 = (
            pl.get_float_attrib(el, "start-angle", drawing_defaults["angle"])
            * math.pi
            / 180
        )
        theta2 = (
            pl.get_float_attrib(el, "end-angle", drawing_defaults["end-angle"])
            * math.pi
            / 180
        )
        if "dashed-size" in el.attrib:
            dashed_array = [
                pl.get_float_attrib(el, "dashed-size"),
                pl.get_float_attrib(el, "dashed-size"),
            ]
        else:
            dashed_array = None
        return {
            "left": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "top": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "radius": pl.get_float_attrib(el, "radius", drawing_defaults["radius"]),
            "startAngle": theta1,
            "endAngle": theta2,
            "opacity": pl.get_float_attrib(el, "opacity", drawing_defaults["opacity"]),
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "strokeDashArray": dashed_array,
            "fill": "",
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
            "originX": "center",
            "originY": "center",
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "radius",
            "start-angle",
            "end-angle",
            "opacity",
            "stroke-color",
            "stroke-width",
            "dashed-size",
        ]


class Text(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        return {
            "left": pl.get_float_attrib(el, "x1", drawing_defaults["x1"]),
            "top": pl.get_float_attrib(el, "y1", drawing_defaults["y1"]),
            "label": pl.get_string_attrib(el, "label", " Text "),
            "offsetx": pl.get_float_attrib(el, "offsetx", 0),
            "offsety": pl.get_float_attrib(el, "offsety", 0),
            "fontSize": pl.get_float_attrib(
                el, "font-size", drawing_defaults["font-size"]
            ),
            "latex": pl.get_boolean_attrib(el, "latex", True),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return ["label", "latex", "font-size", "x1", "y1", "offsetx", "offsety"]


class Axes(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        if "origin" in el.attrib:
            origin = json.loads(pl.get_string_attrib(el, "origin"))
            origin_x = origin["x"]
            origin_y = origin["y"]
        else:
            origin_x = origin_y = 60

        color = pl.get_color_attrib(el, "color", "black")
        return {
            "left": origin_x,
            "top": origin_y,
            "xneg": pl.get_float_attrib(el, "xneg", 20),
            "xpos": pl.get_float_attrib(el, "xpos", 400),
            "yneg": pl.get_float_attrib(el, "yneg", 160),
            "ypos": pl.get_float_attrib(el, "ypos", 160),
            "supporting_lines": json.loads(
                pl.get_string_attrib(el, "supporting-lines", "[]")
            ),
            "label_list": json.loads(pl.get_string_attrib(el, "grid-label", "[]")),
            "labelx": pl.get_string_attrib(el, "label-x", "x"),
            "labely": pl.get_string_attrib(el, "label-y", "y"),
            "offsetx_label_x": pl.get_float_attrib(el, "offsetx-label-x", 0),
            "offsety_label_x": pl.get_float_attrib(el, "offsety-label-x", 0),
            "offsetx_label_y": pl.get_float_attrib(el, "offsetx-label-y", -30),
            "offsety_label_y": pl.get_float_attrib(el, "offsety-label-y", -10),
            "stroke": color,
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "originY": "center",
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "origin",
            "xneg",
            "yneg",
            "xpos",
            "ypos",
            "label-x",
            "offsetx-label-x",
            "offsety-label-x",
            "label-y",
            "offsetx-label-y",
            "offsety-label-y",
            "supporting-lines",
            "grid-label",
            "color",
            "stroke-width",
        ]


class GraphLine(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        curved_line = False

        if "origin" in el.attrib:
            origin = json.loads(pl.get_string_attrib(el, "origin"))
            x0 = origin["x"]
            y0 = origin["y"]
        else:
            x0 = y0 = 0

        if "end-points" in el.attrib:
            line = json.loads(pl.get_string_attrib(el, "end-points"))
            n_end_points = len(line)
            if n_end_points == 2:
                x1 = line[0]["x"]
                x2 = line[1]["x"]
                y1 = line[0]["y"]
                y2 = line[1]["y"]
            elif n_end_points == 3:
                x1 = line[0]["x"]
                x2 = line[1]["x"]
                x3 = line[2]["x"]
                y1 = line[0]["y"]
                y2 = line[1]["y"]
                y3 = line[2]["y"]
                curved_line = True
            else:
                raise ValueError(
                    "pl-graph-line error: the attribute end-points expects a list of size 2 or 3."
                )
        else:
            raise ValueError(
                "pl-graph-line error: required attribute end-points is missing."
            )

        if "end-gradients" in el.attrib:
            if curved_line:
                raise ValueError(
                    "pl-graph-line error: The end-gradients attribute conflicts with an end-points attribute of length 3. You should either provide three points to make a curve or the gradient, but not both."
                )
            grads = json.loads(pl.get_string_attrib(el, "end-gradients"))
            if len(grads) != 2:
                raise ValueError(
                    "pl-graph-line error: the attribute end-gradients expects an array with 2 values, one for each end point."
                )
            grad1 = grads[0]
            grad2 = grads[1]
            if abs(grad1 - grad2) < 1e-9:
                raise ValueError(
                    "The provided gradients are not compatible to compute a quadratic curve between the given points."
                )
            x3 = ((y2 - grad2 * x2) - (y1 - grad1 * x1)) / (grad1 - grad2)
            y3 = (y1 - grad1 * x1) + grad1 * x3
            curved_line = True

        if "draw-error-box" in el.attrib:
            obj_draw = el.attrib["draw-error-box"] == "true"
        else:
            obj_draw = None

        offset_x = pl.get_float_attrib(el, "offset-tol-x", 0)
        offset_y = pl.get_float_attrib(el, "offset-tol-y", 0)
        offset_control_x = pl.get_float_attrib(el, "offset-control-tol-x", 0)
        offset_control_y = pl.get_float_attrib(el, "offset-control-tol-y", 0)
        grid_size = pl.get_integer_attrib(el, "grid-size", 20)
        tol = pl.get_float_attrib(el, "tol", grid_size / 2)

        # Defining the error boxes for end points
        wbox = 2 * tol + 2 * offset_x
        hbox = 2 * tol + 2 * offset_y
        # Defining the error box for the control point
        wbox_c = 2 * tol + 2 * offset_control_x
        hbox_c = 2 * tol + 2 * offset_control_y

        obj = {
            "x1": x0 + x1,
            "y1": y0 - y1,
            "stroke": pl.get_color_attrib(el, "color", "red"),
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 4),
            "handleRadius": 6,
            "objectDrawErrorBox": obj_draw,
            "widthErrorBox": wbox,
            "heightErrorBox": hbox,
            "widthErrorBoxControl": wbox_c,
            "heightErrorBoxControl": hbox_c,
            "offset_x": offset_x,
            "offset_y": offset_y,
            "offset_control_x": offset_control_x,
            "offset_control_y": offset_control_y,
        }

        if not curved_line:
            obj.update({"x2": x0 + x2, "y2": y0 - y2, "type": "pl-controlled-line"})
        else:
            obj.update({
                "x3": x0 + x2,
                "y3": y0 - y2,
                "x2": x0 + x3,
                "y2": y0 - y3,
                "type": "pl-controlled-curved-line",
            })
        return obj

    @staticmethod
    def grading_name(element: HtmlElement) -> str | None:
        curved_line = False
        if "end-points" in element.attrib:
            line = json.loads(pl.get_string_attrib(element, "end-points"))
            grads = json.loads(pl.get_string_attrib(element, "end-gradients", "[]"))
            n_end_points = len(line)
            n_grads = len(grads)
            if n_end_points < 2 or n_end_points > 3:
                raise ValueError(
                    "pl-graph-line error: the attribute end-points expects a list of size 2 or 3."
                )
            if n_grads not in (0, 2):
                raise ValueError(
                    "pl-graph-line error: the attribute end-gradients expects an array with 2 values, one for each end point."
                )
            if n_end_points > 2 and n_grads > 0:
                raise ValueError(
                    "pl-graph-line error: The end-gradients attribute conflicts with an end-points attribute of length 3. You should either provide three points to make a curve or the gradient, but not both."
                )
            if n_end_points == 3:
                curved_line = True
            if n_end_points == 2 and len(grads) == 2:
                curved_line = True
        if not curved_line:
            return "pl-controlled-line"
        else:
            return "pl-controlled-curved-line"

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "origin",
            "end-points",
            "end-gradients",
            "draw-error-box",
            "offset-tol-x",
            "offset-tol-y",
            "offset-control-tol-x",
            "offset-control-tol-y",
            "color",
            "stroke-width",
        ]


class Capacitor(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "interval": pl.get_float_attrib(el, "interval", 10),
            "height": pl.get_float_attrib(el, "height", 15),
            "originX": "center",
            "originY": "center",
            "stroke": pl.get_color_attrib(el, "stroke-color", "black"),
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsetx"]),
            "fontSize": pl.get_float_attrib(
                el, "font-size", drawing_defaults["font-size"]
            ),
            "polarized": pl.get_boolean_attrib(el, "polarized", False),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "interval",
            "height",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "label",
            "offsetx",
            "offsety",
            "font-size",
            "polarized",
        ]


class Battery(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "interval": pl.get_float_attrib(el, "interval", 5),
            "height": pl.get_float_attrib(el, "height", 20),
            "originX": "center",
            "originY": "center",
            "stroke": pl.get_color_attrib(el, "stroke-color", "black"),
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "fontSize": pl.get_float_attrib(
                el, "font-size", drawing_defaults["font-size"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "interval",
            "height",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "label",
            "offsetx",
            "offsety",
            "font-size",
        ]


class Resistor(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "interval": pl.get_float_attrib(el, "interval", 30),
            "height": pl.get_float_attrib(el, "height", 10),
            "originX": "center",
            "originY": "center",
            "stroke": pl.get_color_attrib(el, "stroke-color", "black"),
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "fontSize": pl.get_float_attrib(
                el, "font-size", drawing_defaults["font-size"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "interval",
            "height",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "label",
            "offsetx",
            "offsety",
            "font-size",
        ]


class Inductor(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "interval": pl.get_float_attrib(el, "interval", 40),
            "height": pl.get_float_attrib(el, "height", 20),
            "originX": "center",
            "originY": "center",
            "stroke": pl.get_color_attrib(el, "stroke-color", "black"),
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "fontSize": pl.get_float_attrib(
                el, "font-size", drawing_defaults["font-size"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "interval",
            "height",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "label",
            "offsetx",
            "offsety",
            "font-size",
        ]


class Switch(BaseElement):
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        x1 = pl.get_float_attrib(el, "x1", drawing_defaults["x1"])
        y1 = pl.get_float_attrib(el, "y1", drawing_defaults["y1"])
        if "x2" in el.attrib and "y2" in el.attrib:
            x2 = pl.get_float_attrib(el, "x2")
            y2 = pl.get_float_attrib(el, "y2")
        else:
            w = pl.get_float_attrib(el, "width", drawing_defaults["force-width"])
            angle = pl.get_float_attrib(el, "angle", 0)
            x2 = x1 + w * math.cos(angle * math.pi / 180)
            y2 = y1 + w * math.sin(angle * math.pi / 180)
        return {
            "x1": x1,
            "y1": y1,
            "x2": x2,
            "y2": y2,
            "interval": pl.get_float_attrib(el, "interval", 40),
            "switchAngle": pl.get_float_attrib(el, "switch-angle", 30),
            "drawPin": pl.get_boolean_attrib(el, "draw-pin", True),
            "originX": "center",
            "originY": "center",
            "stroke": pl.get_color_attrib(el, "stroke-color", "black"),
            "strokeWidth": pl.get_float_attrib(
                el, "stroke-width", drawing_defaults["stroke-width"]
            ),
            "selectable": drawing_defaults["selectable"],
            "evented": drawing_defaults["selectable"],
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", drawing_defaults["offsetx"]),
            "offsety": pl.get_float_attrib(el, "offsety", drawing_defaults["offsety"]),
            "fontSize": pl.get_float_attrib(
                el, "font-size", drawing_defaults["font-size"]
            ),
        }

    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "x1",
            "y1",
            "width",
            "angle",
            "interval",
            "switch-angle",
            "draw-pin",
            "x2",
            "y2",
            "stroke-color",
            "stroke-width",
            "label",
            "offsetx",
            "offsety",
            "font-size",
        ]


elements["pl-4pointrod"] = FourPointRod
elements["pl-3pointrod"] = ThreePointRod
elements["pl-arc"] = Arc
elements["pl-arc-dimensions"] = ArcDimensions
elements["pl-arc-vector"] = ArcVector
elements["pl-axes"] = Axes
elements["pl-circle"] = Circle
elements["pl-clamped"] = Clamped
elements["pl-collar-rod"] = CollarRod
elements["pl-controlled-curved-line"] = ControlledCurvedLine
elements["pl-controlled-line"] = ControlledLine
elements["pl-coordinates"] = Coordinates
elements["pl-dimensions"] = Dimensions
elements["pl-distributed-load"] = DistributedLoad
elements["pl-double-headed-vector"] = DoubleHeadedVector
elements["pl-fixed-pin"] = FixedPin
elements["pl-graph-line"] = GraphLine
elements["pl-line"] = Line
elements["pl-point"] = Point
elements["pl-polygon"] = Polygon
elements["pl-pulley"] = Pulley
elements["pl-rectangle"] = Rectangle
elements["pl-rod"] = Rod
elements["pl-roller"] = Roller
elements["pl-spring"] = Spring
elements["pl-coil"] = Coil
elements["pl-text"] = Text
elements["pl-triangle"] = Triangle
elements["pl-vector"] = Vector
elements["pl-paired-vector"] = PairedVector
elements["pl-capacitor"] = Capacitor
elements["pl-battery"] = Battery
elements["pl-resistor"] = Resistor
elements["pl-inductor"] = Inductor
elements["pl-switch"] = Switch

# Base Elements


class UnplaceableBaseElement(BaseElement):
    # Used only to get attributes
    @staticmethod
    def generate(el: HtmlElement, data: dict) -> dict:
        raise RuntimeError("Cannot create element!")

    @staticmethod
    def is_gradable() -> bool:
        return False

    @staticmethod
    def grade(ref: dict, st: dict, tol: float, angtol: float) -> bool:
        raise NotImplementedError(
            "This element should not be graded!  If you see this message, something has gone terribly wrong!"
        )


class DrawingElement(UnplaceableBaseElement):
    @staticmethod
    def get_attributes() -> list[str]:
        return [
            "gradable",
            "answers-name",
            "width",
            "height",
            "grid-size",
            "snap-to-grid",
            "correct-answer",
            "tol",
            "angle-tol",
            "show-tolerance-hint",
            "tolerance-hint",
            "disregard-extra-elements",
            "hide-answer-panel",
        ]


class DrawingInitial(UnplaceableBaseElement):
    @staticmethod
    def get_attributes() -> list[str]:
        return ["draw-error-box"]


class DrawingAnswer(UnplaceableBaseElement):
    @staticmethod
    def get_attributes() -> list[str]:
        return ["draw-error-box"]


class DrawingGroup(UnplaceableBaseElement):
    @staticmethod
    def get_attributes() -> list[str]:
        return ["visible"]


class DrawingControls(UnplaceableBaseElement):
    @staticmethod
    def get_attributes() -> list[str]:
        return []


class DrawingControlsGroup(UnplaceableBaseElement):
    @staticmethod
    def get_attributes() -> list[str]:
        return ["label"]


class DrawingControlsButton(UnplaceableBaseElement):
    @staticmethod
    def validate_attributes() -> bool:
        return False

    @staticmethod
    def get_attributes() -> list[str]:
        return ["type"]


elements["pl-drawing"] = DrawingElement
elements["pl-drawing-initial"] = DrawingInitial
elements["pl-drawing-answer"] = DrawingAnswer
elements["pl-drawing-group"] = DrawingGroup
elements["pl-controls"] = DrawingControls
elements["pl-controls-group"] = DrawingControlsGroup
elements["pl-drawing-button"] = DrawingControlsButton


# Store elements that have been registered via extensions
registered_elements = {}


# Helper Functions


def should_validate_attributes(name: str):
    if name in elements:
        return elements[name].validate_attributes()
    else:
        return False


def get_attributes(name: str):
    if name in elements:
        return elements[name].get_attributes()
    else:
        return []


def generate(element: HtmlElement, name: str, defaults: dict | None = None):
    if defaults is None:
        defaults = {}
    if name in elements:
        obj = defaults.copy()
        cls = elements[name]
        data = registered_elements.get(name, [])
        obj.update(cls.generate(element, data))

        # By default, set the grading name to the element name
        grading_name = cls.grading_name(element)
        if grading_name is None:
            grading_name = name

        obj["gradingName"] = grading_name
        obj["type"] = grading_name
        return obj
    else:
        return {}


def is_gradable(name: str):
    if name in elements:
        return elements[name].is_gradable()
    return False


def grade(reference: dict, element: dict, name: str, tol: float, angtol: float):
    if name in elements:
        cls = elements[name]
        if cls.is_gradable():
            return elements[name].grade(reference, element, tol, angtol)
    return False


def register_extension(name, module, data):
    data_obj = {
        "clientFilesUrl": data["options"]
        .get("client_files_extensions_url", {})
        .get(name, None)
    }
    for elem_name, elem in module.elements.items():
        registered_elements[elem_name] = data_obj
        elements[elem_name] = elem
