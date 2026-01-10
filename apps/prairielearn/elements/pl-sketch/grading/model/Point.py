import math

from .Tag import Tag


class Point(Tag):
    def __init__(self, parent_function, x, y, pixel=True):
        super().__init__()
        if pixel:
            self.px = x
            self.py = y
            self.x = parent_function._px_to_xval(x)
            self.y = parent_function._px_to_yval(y)
        else:
            self.x = x
            self.y = y
            self.px = parent_function._xval_to_px(x)
            self.py = parent_function._yval_to_px(y)

    def get_px_distance_squared(self, point):
        dx = point.px - self.px
        dy = point.py - self.py
        return dx**2 + dy**2

    def get_euclidean_distance(self, point):
        return math.sqrt(self.get_px_distance_squared(point))

    def get_x_distance(self, x):
        return abs(x - self.x)

    def get_y_distance(self, y):
        return abs(y - self.y)
