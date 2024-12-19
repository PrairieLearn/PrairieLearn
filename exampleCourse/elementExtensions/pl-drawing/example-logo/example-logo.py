from os import path

import prairielearn as pl

# Import class definitions and default values from the drawing element
defaults = pl.load_host_script("defaults.py")
elements = pl.load_host_script("elements.py")


# Elements
class PrairieLearnLogo(elements.BaseElement):
    def generate(self, data):
        return {
            "left": pl.get_float_attrib(self, "x", 20),
            "top": pl.get_float_attrib(self, "y", 20),
            "angle": pl.get_float_attrib(self, "angle", 0),
            "image_url": path.join(data["clientFilesUrl"], "logo.png"),
        }

    def get_attributes():
        return ["x", "y", "angle"]


elements = {}
elements["pl-prairielearn-logo"] = PrairieLearnLogo
