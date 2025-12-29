class Axis:
    def __init__(self, domain, pixels):  # TODO: support non-linear axis types
        self.domain = domain
        self.pixels = pixels

    def pixel_to_coord(self, value):
        return self.domain[0] + (value / self.pixels) * (
            self.domain[1] - self.domain[0]
        )

    def coord_to_pixel(self, value):
        return (
            self.pixels * (value - self.domain[0]) / (self.domain[1] - self.domain[0])
        )
