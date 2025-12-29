from grading.utils import point_ltgt_function, point_on_function

from .Gradeable import Gradeable
from .Tag import Tag


class Asymptote(Tag):
    """An asymptote wrapper class. Contains the x or y value that defines
    the vertical or horizontal asymptote.
    """

    def __init__(self, value):
        super().__init__()
        self.value = value


class Asymptotes(Gradeable):
    #    """Asymptote.
    #
    #    Note:
    #        Asymptotes is a generic class. You must instantiate either the
    #        VerticalAsymptotes or the HorizontalAsymptotes class to use the
    #        grading functions below.
    #    """
    def __init__(self, info, tolerance=dict()):
        super().__init__(info, tolerance)

        self.set_default_tolerance(
            "asym_distance", 20
        )  # consider an asymptote to be at a value if it is within 20 pixels
        self.set_default_tolerance(
            "asym_same", 10
        )  # consider two asymptotes the same if they are within 10 pixels

        self.asyms = []
        self.px_asyms = []
        toolid = info["grader"]["currentTool"]
        submission_data = info["submission"]["gradeable"][toolid]
        for spline in submission_data:
            px, val = self.value_from_spline(spline["spline"])
            include = True
            for pxa in self.px_asyms:
                if abs(pxa - px) < self.tolerance["asym_same"]:
                    include = False
            if include:
                self.asyms.append(Asymptote(val))
                self.px_asyms.append(px)
                if "tag" in spline:
                    self.asyms[-1].set_tag(spline["tag"])

        self.scale = 1
        self.set_tagables(None)
        if len(self.asyms) > 0:
            self.set_tagables(self.asyms)

    def value_from_spline(self, spline):
        raise NotImplementedError("Abstract asymptote cannot be converted from spline.")

    def closest_asym_to_value(self, v):
        """Return the absolute distance between v and the closest asymptote and the x or y axis value of that asymptote.

        Args:
            v: a value in the range of the x or y axis.

        Returns:
            float, float:
            minDistance: the absolute difference between v and the asymptote,
                         or float('inf') if no asymptote exists.
            closestAsym: the value of the closest asymptote to the value v,
                         or None if no asymptote exists.
        """
        min_distance = float("inf")
        closest_asym = None
        for a in self.asyms:
            asym = a.value
            d = abs(asym - v)
            if d < min_distance:
                min_distance = d
                closest_asym = asym

        return min_distance, closest_asym

    def get_asym_at_value(self, v, tolerance=None):
        """Return the asymptote at the value v, or None.

        Args:
            v: a value in the range of the x or y axis.
            tolerance(default: None): pixel distance tolerance, if None is given 'asym_distance' constant is used.

        Returns:
            float: the value of an asymptote that is within tolerances of
                   the value v, or None if no such asymptote exists.
        """
        if tolerance is None:
            tolerance = self.tolerance["asym_distance"] / (1.0 * self.scale)
        else:
            tolerance /= 1.0 * self.scale

        d, asym = self.closest_asym_to_value(v)
        if d < tolerance:
            return asym
        if self.debug:
            self.debugger.add(
                f"Closest asymptote is {d * self.scale} pixels away from expected."
            )
            self.debugger.add(f"Max allowed is {tolerance * self.scale} pixels.")

        return None

    def has_asym_at_value(self, v, tolerance=None):
        """Return whether an asymtote is declared at the given value.

        Args:
            v: a value in the range of the x or y axis.
            tolerance(default: None): pixel distance tolerance, if None is given 'asym_distance' constant is used.

        Returns:
            bool: true if there is an asymptote declared within tolerances
            of the value v, or false otherwise.
        """
        return self.get_asym_at_value(v, tolerance=tolerance) is not None

    def get_number_of_asyms(self):
        """Return the number of asymptotes declared in the function.

        Returns:
            int: the number of asymptotes declared in the function.
        """
        return len(self.asyms)

    # Not implementing
    def matches_function(self, func, x1, x2, tolerance):
        rg = x2 - x1
        interval = rg / 3
        hits = 0
        total = 0
        asyms = self.asyms
        if len(asyms) != 1:
            return False
        for i in range(4):  # need 4 out of 5 hits to be considered
            x = x1 + i * interval
            try:
                if point_on_function(self, [x, asyms[0].value], func, tolerance):
                    hits += 1
            except Exception:
                continue
            total += 1
        if total == 0:
            return len(asyms) == 0
        return hits == total

    def lt_function(self, func, x1, x2, tolerance):
        return self.ltgt_function(func, x1, x2, False, tolerance)

    def gt_function(self, func, x1, x2, tolerance):
        return self.ltgt_function(func, x1, x2, True, tolerance)

    def ltgt_function(self, func, x1, x2, greater, tolerance):
        rg = x2 - x1
        interval = rg / 4
        hits = 0
        total = 0
        asyms = self.asyms
        if len(asyms) == 0:
            if self.debug:
                self.debugger.add("Line not found.")
            return "ndef"
        for i in range(5):
            x = x1 + i * interval
            try:
                broke = False
                for asy in asyms:
                    if not point_ltgt_function(
                        self, [x, asy.value], func, greater, tolerance
                    ):
                        broke = True
                        break
                if not broke:
                    hits += 1
            except Exception:
                continue
            total += 1
        if total == 0:
            return True
        return hits == total  # general estimate


class VerticalAsymptotes(Asymptotes):
    """Vertical Asymptote.

    Note:
        Use this class to interact with any vertical asymptotes in the
        function you are grading.
    """

    def __init__(self, info):
        Asymptotes.__init__(self, info)
        self.scale = self.xscale

    def value_from_spline(self, spline):
        # gets x coordinate of first point
        px = spline[0][0]
        x = self._px_to_xval(px)
        return px, x

    def get_range_defined(self):
        if len(self.asyms) == 0:
            return []
        else:
            margin = 6 / self.xscale
            rd = [[asym.value - margin, asym.value + margin] for asym in self.asyms]
        return rd


class HorizontalAsymptotes(Asymptotes):
    """Horizontal Asymptote.

    Note:
        Use this class to interact with any horizontal asymptotes in the
        function you are grading.
    """

    def __init__(self, info):
        Asymptotes.__init__(self, info)
        self.scale = self.yscale

    def value_from_spline(self, spline):
        # gets y coordinate of first point
        px = spline[0][1]
        y = self._px_to_yval(px)
        return px, y

    def get_range_defined(self):
        if len(self.asyms) == 0:
            return []
        else:
            return [self.xaxis.domain]

    def less_than_y(self, y, tolerance):  # graph tolerance
        if len(self.asyms) == 0:
            if self.debug:
                self.debugger.add("Horizontal line not found.")
            return "ndef"
        for asym in self.asyms:
            if asym.value > y + tolerance:
                if self.debug:
                    self.debugger.add(
                        f"Line higher than y = {y} by {(asym.value - y) * self.yscale} pixels."
                    )
                    self.debugger.add(
                        f"Max allowed is {tolerance * self.scale} pixels."
                    )
                return False
        return True

    def greater_than_y(self, y, tolerance):  # graph tolerance
        if len(self.asyms) == 0:
            if self.debug:
                self.debugger.add("Horizontal line not found.")
            return "ndef"
        for asym in self.asyms:
            if asym.value < y - tolerance:
                if self.debug:
                    self.debugger.add(
                        f"Line lower than y = {y} by {(y - asym.value) * self.yscale} pixels."
                    )
                    self.debugger.add(
                        f"Max allowed is {tolerance * self.scale} pixels."
                    )

                return False
        return True
