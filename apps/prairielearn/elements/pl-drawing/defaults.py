from typing import TypedDict

ElementDefaults = TypedDict(
    "ElementDefaults",
    {
        "gradable": bool,
        "answers-name": str,
        "draw-error-box": bool,
        "grid-size": int,
        "angle-tol": int,
        "snap-to-grid": bool,
        "width": int,
        "height": int,
        "show-tolerance-hint": bool,
        "render-scale": float,
        "disregard-extra-elements": bool,
    },
)

DrawingDefaults = TypedDict(
    "DrawingDefaults",
    {
        "x1": int,
        "y1": int,
        "x2": int,
        "y2": int,
        "offsetx": int,
        "offsety": int,
        "width": int,
        "width-rod": int,
        "height": int,
        "label": str,
        "angle": int,
        "end-angle": int,
        "radius": int,
        "opacity": float,
        "stroke-width": int,
        "selectable": bool,
        "font-size": int,
        "point-size": int,
        "force-width": int,
    },
)
element_defaults: ElementDefaults = {
    "gradable": False,
    "answers-name": "",
    "draw-error-box": False,
    "grid-size": 20,
    "angle-tol": 10,
    "snap-to-grid": False,
    "width": 580,
    "height": 320,
    "show-tolerance-hint": True,
    "render-scale": 1.5,
    "disregard-extra-elements": False,
}

drawing_defaults: DrawingDefaults = {
    "x1": 40,
    "y1": 40,
    "x2": 80,
    "y2": 20,
    "offsetx": 2,
    "offsety": 2,
    "width": 30,
    "width-rod": 20,
    "height": 40,
    "label": "",
    "angle": 0,
    "end-angle": 60,
    "radius": 20,
    "opacity": 1,
    "stroke-width": 2,
    "selectable": False,
    "font-size": 16,
    "point-size": 4,
    "force-width": 60,
}

no_submission_error = "There was no submitted answer.  Please place some objects on the canvas and try again."
