from os import path

import prairielearn as pl

# Import class definitions and default values from the drawing element
defaults = pl.load_host_script("defaults.py")
elements = pl.load_host_script("elements.py")


# Elements
class CapacitorDraw(elements.BaseElement):
    def generate(el, data):
        stroke_color = pl.get_color_attrib(el, "stroke-color", "black")
        return {
            "x1": pl.get_float_attrib(el, "x1", 20),
            "y1": pl.get_float_attrib(el, "y1", 20),
            "x2": pl.get_float_attrib(el, "x2", 100),
            "y2": pl.get_float_attrib(el, "y2", 20),
            "stroke": stroke_color,
            "strokeWidth": pl.get_float_attrib(el, "stroke-width", 2),
            "label": pl.get_string_attrib(el, "label", ""),
            "offsetx": pl.get_float_attrib(el, "offsetx", 0),
            "offsety": pl.get_float_attrib(el, "offsety", 0),     
            "fontSize": pl.get_float_attrib(el, "font-size", 14), 
            "fontAngle": pl.get_float_attrib(el, "font-angle", 0), 
            "polarized": pl.get_boolean_attrib(el, "polarized", False), 
        }

    def get_attributes():
        return ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "label", "offsetx", "offsety", "fontSize", "fontAngle", "polarized" ]


elements = {}
elements["pl-capacitor"] = CapacitorDraw