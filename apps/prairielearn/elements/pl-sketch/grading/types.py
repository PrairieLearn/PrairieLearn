from typing import TypedDict


class SketchTool(TypedDict):
    name: str
    id: str
    label: str | None
    color: str | None
    readonly: bool | None
    helper: bool | None
    limit: int | None
    group: str | None
    dashStyle: str | None
    directionConstraint: str | None
    lengthConstraint: float | None
    size: int | None
    hollow: bool | None
    opacity: float | None
    closed: (
        bool | None
    )  # Polygons are internally "closed polylines" - this flag is the only difference
    fillColor: str | None
    arrowHead: int | None


class SketchGrader(TypedDict):
    type: str
    toolid: list[SketchTool]
    x: float | str | None
    y: float | None
    endpoint: str | None
    xrange: list[float] | None
    yrange: list[float] | None
    count: int | None
    fun: str | None
    xyflip: bool | None
    mode: str | None
    allowundefined: bool | None
    weight: int
    stage: int
    tolerance: int
    feedback: str | None
    debug: bool


class SketchCanvasSize(TypedDict):
    x_start: float
    x_end: float
    y_start: float
    y_end: float
    height: int
    width: int


class SketchInitial(TypedDict):
    toolid: str
    fun: str | None
    xrange: list[float]
    coordinates: list[float]
