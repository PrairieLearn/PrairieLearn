from .Axis import Axis
from .Debugger import Debugger
from .Tag import Tagables


class Gradeable(Tagables):
    def __init__(
        self, gradeable_info, tolerance=dict()
    ):  # gradeable_info : {"grader": grader, "submission": submission}
        super().__init__()
        config = gradeable_info["submission"]["meta"]["config"]
        xaxis = Axis(config["xrange"], config["width"])
        yaxis = Axis(config["yrange"][::-1], config["height"])
        self.xaxis = xaxis
        self.yaxis = yaxis
        self.width = xaxis.pixels
        self.height = yaxis.pixels
        self.xscale = 1.0 * self.width / (xaxis.domain[1] - xaxis.domain[0])
        self.yscale = 1.0 * self.height / (yaxis.domain[0] - yaxis.domain[1])

        self.tolerance = tolerance
        self.debug = gradeable_info["grader"]["debug"]
        self.debug_message = ""
        if self.debug:
            self.debugger = Debugger(
                gradeable_info["grader"]["type"],
                gradeable_info["grader"]["currentTool"],
                gradeable_info["grader"]["tolerance"],
            )

    def set_default_tolerance(self, key, default_value):
        if key not in self.tolerance:
            self.tolerance[key] = default_value

    # value <-> pixel conversions ##

    def _xval_to_px(self, xval):
        return self.xaxis.coord_to_pixel(xval)

    def _px_to_xval(self, px):
        return self.xaxis.pixel_to_coord(px)

    def _yval_to_px(self, yval):
        return self.yaxis.coord_to_pixel(yval)

    def _px_to_yval(self, px):
        return self.yaxis.pixel_to_coord(px)

    def within_y_range(self, y_val, negative_tolerance=0, positive_tolerance=0):
        if y_val is None:
            return False
        yrange = self.yaxis.domain
        height = self.yaxis.pixels
        scale = abs(yrange[0] - yrange[1]) / height
        g_neg_t = negative_tolerance * scale
        g_pos_t = positive_tolerance * scale
        return y_val <= (yrange[0] - g_neg_t + g_pos_t) and y_val >= (
            yrange[1] + g_neg_t - g_pos_t
        )

    def within_x_range(self, x_val, negative_tolerance=0, positive_tolerance=0):
        if x_val is None:
            return False
        xrange = self.xaxis.domain
        width = self.xaxis.pixels
        scale = abs(xrange[1] - xrange[0]) / width
        g_neg_t = negative_tolerance * scale
        g_pos_t = positive_tolerance * scale
        return x_val >= (xrange[0] + g_neg_t - g_pos_t) and x_val <= (
            xrange[1] - g_neg_t + g_pos_t
        )

    def add_debug(self, str):
        self.debug_message += "\n"
        self.debug_message += str
