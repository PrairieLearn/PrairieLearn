# PrairieLearn OER Element: Sketch Response

If you like this element, you can use it in your own PrairieLearn course by copying the contents of the `elements` folder _and_ the `serverFilesCourse` folder into your own course repository. After syncing, the element can be used as illustrated by the example question that is also contained in this repository.

## `pl-sketch` element

This element provides a canvas and a number of drawing _tools_ that students can use to draw _objects_ such as lines, points and shapes. For lines, the canvas supports both freehand sketching and segmented lines/splines. You can use a variety of different _criteria_ to grade students' drawings.

This element can be customized with a number of attributes, as well as tags that are nested inside the main `pl-sketch` tag:

1. Each `pl-sketch-tool` tag defines a drawing tool that is available in the canvas.
2. Each `pl-sketch-grade` tag defines a grading criterion for student submissions.
3. Each `pl-sketch-initial` tag defines an object that is present in the initial canvas.

### Example

```html
<pl-sketch answers-name="example" xrange="0,10" yrange="-10,10">
    <pl-sketch-tool type="free-draw" id="f" color="black">
    <pl-sketch-tool type="point" id="p" hollow="true" read-only="true">
    <pl-sketch-initial toolid="p" x="0" y="1">
    <pl-sketch-initial toolid="p" x="1" y="0">
    <pl-sketch-grade type="match" toolid="f" x="0" y="1">
    <pl-sketch-grade type="match" toolid="f" x="1" y="0">
    <pl-sketch-grade type="defined-in" toolid="f" xrange="0,5">
    <pl-sketch-grade type="monot-increasing" toolid="f" xrange="1," weight="2">
</pl-sketch>
```

This example element provides students with a canvas contains 2 pre-defined points at coordinates $(0,1)$ and $(1,0)$. It also provides them with a freehand sketching tool. Note that the point tool is defined as `read-only="true"`, so it is only used for the initial objects and not available to students. Student submissions are then graded based on 4 criteria: that their drawn function touches both points at $(0,1)$ and $(1,0)$, that it is defined everywhere in the x-interval $[0,5]$, and that it is monotonously increasing for $x>1$. The last grading criterion is worth twice the amount of partial points as the other three criteria.

### Element Attributes

The following attributes are set at the element level and mostly configure the canvas itself.

| Attribute        | Type                       | Description                                                                                                                                                                       |
| ---------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answers-name`   | string (required)          | Unique name for the element.                                                                                                                                                      |
| `weight`         | integer (default: `1`)     | Weight of element's score in the question it is a part of.                                                                                                                        |
| `xrange`         | string (default: `"-5,5"`) | x-range of the canvas as a comma-separated pair of numbers, e.g. `"-3,1.5"`. A 10 pixel wide ungraded margin is added above and below the ends of this range.                     |
| `yrange`         | string (default: `"-5,5"`) | y-range of the canvas as a comma-separated pair of numbers, e.g. `"-3,1.5"`. A 10 pixel wide ungraded margin is added above and below the ends of this range.                     |
| `graph-width`    | integer (default: `800` )  | Screen width of the canvas in pixels.                                                                                                                                             |
| `graph-height`   | integer (default: `450`)   | Screen height of the canvas in pixels.                                                                                                                                            |
| `read-only`      | boolean (default: `false`) | If set to `true`, the graph is not editable. This setting can be used to show the objects defined in `pl-sketch-initial` tags as static question materials.                       |
| `enforce-bounds` | boolean (default: `false`) | If set to `true`, objects cannot be dragged past the edges of the canvas. Note that objects that are dragged fully off-canvas are deleted and not considered for grading purposes |
| `allow-blank`    | boolean (default: `false`) | Allows the graph to be graded even if it is empty. Objects defined in `pl-sketch-initial` tags are not considered when determining whether a graph is empty.                      |

### Defining drawing tools with `pl-sketch-tool`

Each drawing tool tag represents one kind of object that students' drawings (or initial ones) can contain. Unless tools are defined as `read-only="true"`, they each have their own button in the element's toolbar. Tools have a type that defines their drawing behavior, and there can be multiple tools with the same type and different customizations (e.g., different types of points with different colors).

Tools are rendered in order of definition. This means that, for example, points must be defined after lines to appear on top of them. We also recommend defining read-only tools before other tools so they do not block drag and drop interactions.

_Note that all attributes other than `type` are optional. The default values (other than `read-only` and `helper`, which are `false` by default) depend on the tool type and are listed separately below._

| Parameter              | Type                                                                         | Available for tool types             | Description                                                                                                                                                                                            |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                 | string                                                                       | -                                    | Type of the tool (see below)                                                                                                                                                                           |
| `id`                   | string                                                                       | All                                  | Unique name of the tool.                                                                                                                                                                               |
| `label`                | string                                                                       | All                                  | Label for the tool in the toolbar.                                                                                                                                                                     |
| `read-only`            | boolean                                                                      | All                                  | If set to `true`, students cannot use this tool and it does not appear in the toolbar. It is only usable to add objects to the initial state of the canvas.                                            |
| `helper`               | boolean                                                                      | All                                  | If set to `true`, the tool is displayed in a separate dropdown list of "helper" tools that are only meant to support students in drawing their answers. It is also excluded from any grading criteria. |
| `group`                | string                                                                       | All                                  | Label of the dropdown group the tool belongs to. If set, the tool will appear in a dropdown with other tools in the same group.                                                                        |
| `color`                | string                                                                       | All                                  | Color of the tool.                                                                                                                                                                                     |
| `dash-style`           | string: `"solid"`, `"dashed"`, `"longdashed"`, `"dotted"`, or `"dashdotted"` | line, horizontal-line, vertical-line | Dash style of the drawn line.                                                                                                                                                                          |
| `direction-constraint` | string: `"none"`, `"horizontal"` or `"vertical"`                             | line                                 | Constraint of the direction in which the line can be drawn.                                                                                                                                            |
| `length-constraint`    | float                                                                        | line                                 | If not `0`, maximum length of line in the internal coordinate system of the canvas.                                                                                                                    |
| `arrowhead`            | integer                                                                      | line                                 | If not `0`, length of the arrowhead on the terminal end of the line in pixels.                                                                                                                         |
| `size`                 | integer                                                                      | point                                | Diameter of point in pixels.                                                                                                                                                                           |
| `hollow`               | boolean                                                                      | point                                | Whether the point is hollow or full.                                                                                                                                                                   |
| `fill-color`           | string                                                                       | polygon                              | Color of polygon's filling                                                                                                                                                                             |
| `fill-opacity`         | float (0 to 1)                                                               | polygon                              | Opacity of the polygon's fill-color                                                                                                                                                                    |

#### Supported tool types and default settings

The element supports the list of tool types shown below.

#### **`free-draw`**

Lines drawn in any shape using drag-and-release. Lines are slightly smoothened after drawing and can be moved and deleted, but not edited after drawing them.

**Defaults:**

```
id="fd" label="Function f(x)" color="blue"
```

#### **`point`**

Points placed by clicking at a specific location in the canvas.

**Defaults:**

```
id="pt" label="Point" color="black" size="15"
```

#### **`horizontal-line`**

Horizontal lines that span the entire canvas (effectively marking a y-coordinate).

**Defaults:**

```
id="hl" label="Horizontal Line" color="dimgray" dash-style="dashdotted"
```

#### **`vertical-line`**

Vertical lines that span the entire canvas (effectively marking an x-coordinate).

**Defaults:**

```
id="vl" label="Vertical Line" color="dimgray" dash-style="dashdotted"
```

#### **`line`**

Straight lines that can be drawn between two points. Optional constaints can restrict length/direction and an optional arrowhead can distinguish the two endpoints.

**Defaults:**

```
id="line" label="Line" color="red" dash-style="solid" direction-constraint="none length-constraint="0" arrowhead="0"
```

#### **`polyline`**

Complex lines, each consisting of straight line segments. Each segment extends the line by another connected point. Pressing "Enter" or switching tools finishes a line. Points can be moved after the line has been finished.

**Defaults:**

```
id="pline" label="Polyline" color="orange" dash-style="solid"
```

#### **`spline`**

Complex lines, each consisting of multiple line segments. Segments are curved to create a overall line. Each segment extends the line by another conected point. Pressing "Enter" or switching tools finishes a line. Points can be moved after the line has been finished.

**Defaults:**

```
id="sp" label="Spline" color="purple"
```

#### **`polygon`**

Polygon shapes, each consisting of multiple line segments with connected endpoints. Each segment extends the line by another conected point, and the final connector of the endpoints is automatically inserted. The area of the polygon can be shaded. Pressing the "Enter" button or switching tools finishes a polygon. Points can be moved after the line has been finished.

**Defaults:**

```
id="pg" label="Polygon" color="mediumseagreen" fill-color="mediumseagreen" fill-opacity="0.5"
```

## Defining grading criteria with `pl-sketch-grade`

Each grading criterion tag represents one grading check that is used to determine the score for students' drawings. Each criterion can be assigned to either one or more specific drawing tools, or all tools (unless marked as `helper="true"` or incompatible with the criterion). The following attributes can be used to customized any grading criterion, independent of type of assigned tool:

| Parameter   | Type                     | Description                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`      | string                   | Type of the grading criterion (see below)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `toolid`    | string (optional)        | One or more comma-separated `id`s of the tool(s) to be checked by this grading criterion. If not defined, all compatible non-helper tools are considered in the check. All tools specified must meet the grading criterion in order for it to be correct, with the exceptions of `match`, which checks that at least one of the tools meets the grading criterion, and `defined-in`, which looks at the combined coverage of all the tools listed. |
| `xrange`    | string (default: `","`)  | Interval on the x-axis in which the criterion should be applied as a comma-separated pair of numbers, e.g. `"-3,1.5"`. Start and/or end of the range can be blank (e.g., `"-3,"`or `",-3"`) to extend to the edge of the canvas.                                                                                                                                                                                                                   |
| `feedback`  | string (optional)        | Message to be displayed to students if the grading check fails. Defaults to a generic message that is dependent on the grading criterion.                                                                                                                                                                                                                                                                                                          |
| `tolerance` | integer (optional)       | Unless defined otherwise, tolerance is the maximum allowed pixel distance between the specified coordinate/function and the tool. Defaults depend on the type of the grading criterion.                                                                                                                                                                                                                                                            |
| `weight`    | integer (default: `1`)   | Weight of the grading criterion's score within the element's grading context.                                                                                                                                                                                                                                                                                                                                                                      |
| `stage`     | integer (optional)       | Stage in which this criterion is applied (see below). By default, the criterion is always applied, independent of any criteria with stages.                                                                                                                                                                                                                                                                                                        |
| `debug`     | boolean (default: false) | If set to true, will display quantitative details about why the grading criteria was not met.                                                                                                                                                                                                                                                                                                                                                      |

### Supported grading types

Note that when `free-draw`/`polyline`/`spline` tools are graded, they are treated as a mathematical function, so there can be at most one y-value for each x-coordinate. If there are multiple lines at the same x-coordinate, only the first one is considered for grading. Multiple line fragments drawn with the same tool are automatically treated as part of the same function definition. Other tools, such as `polygon`, `point` and `line`, are not treated this way and the entire shape is considered for grading purposes.

| Type               | Description                                                                             | Supported tool types                                                | Type-specific parameters                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `count`            | Number of objects drawn with the specified tool.                                        | All                                                                 | `count`: number of occurences to test for. `mode`: `"exact"` (default), `"at-least"`, or `"at-most"`. `"tolerance"`: only applied if `xrange` is set; A pixel-based margin (default: 15) is added/removed from both ends of the xrange depending on `mode`. For all modes, either the count within `xrange` or the count with the applied margins needs to be correct.                                                                               |
| `match`            | Checks whether the drawings match (touch or intersect) a specified coordinate or point. | All                                                                 | `x` (optional): x-coordinate that much be matched. `y` (optional): y-coordinate that must be matched. At least one of `x` or `y` must be defined. Note that this type does not support `xrange`. `endpoint` (optional: "either", "start", or "end"): Only to be used for the line tool; specifies which endpoint should match the specified x,y coordinates. `tolerance`: (default 15)                                                               |
| `defined-in`       | Checks whether the drawings cover the entire x-axis or interval                         | All                                                                 | `tolerance`: Number of x-axis pixels that may be not covered in an answer that is still considered correct (default: 20).                                                                                                                                                                                                                                                                                                                            |
| `undefined-in`     | Checks whether the drawings do not cover any part of the x-axis or interval             | All                                                                 | `tolerance`: Number of x-axis pixels that may be covered in an answer that is still considered correct (default: 20).                                                                                                                                                                                                                                                                                                                                |
| `less-than`        | Checks whether the drawings are always below a given y-coordinate or function           | All but `vertical-line`                                             | `y`: y-coordinate to be compared to the drawings. `fun`: function to be compared to the drawings (see below). Only `y` _or_ `fun` can be set. `fun-x-y-flip`: If `true` (default: `false`), the function provided in `fun` is treated as `x = f(y)` instead of `y = f(x)` (see below). `yrange`: only to be used if `fun-x-y-flip` is `true`; replaces `xrange`. `"tolerance"`: (default: 20).                                                       |
| `greater-than`     | Checks whether the drawings are always above a given y-coordinate or function           | All but `vertical-line`                                             | `y`: y-coordinate to be compared to the drawings. `fun`: function to be compared to the drawings (see below). Only `y` _or_ `fun` can be set. `fun-x-y-flip`: If `true` (default: `false`), the function provided in `fun` is treated as `x = f(y)` instead of `y = f(x)` (see below). `yrange`: only to be used if `fun-x-y-flip` is `true`; replaces `xrange`. `"tolerance"`: (default: 20).                                                       |
| `match-fun`        | Checks whether drawings follow a given function                                         | `free-draw`, `point`, `polyline`, `spline`,`line`,`horizontal-line` | `fun`: the function being compared to (see below). `allow-undefined`: If `"false"` (default), the entire domain of the function (with some tolerance) must be covered; otherwise, gaps are ignored. `fun-x-y-flip`: If `true` (default: `false`), the function provided in `fun` is treated as `x = f(y)` instead of `y = f(x)` (see below). `yrange`: only to be used if `fun-x-y-flip` is `true`; replaces `xrange`. `"tolerance"`: (default: 20). |
| `monot-increasing` | Checks whether the drawn function is monotonically increasing.                          | `free-draw`, `line`, `polyline`, `spline`                           | This check is performed by dividing each graded object individually into 100 equally sized intervals and comparing their end points. `tolerance`: how many segments per object are allowed to be undefined or decreasing (default: 5).                                                                                                                                                                                                               |
| `monot-decreasing` | Checks whether the drawn function is monotonically decreasing.                          | `free-draw`, `line`, `polyline`, `spline`                           | This check is performed by dividing each graded object individually into 100 equally sized intervals and comparing their end points. `tolerance`: how many segments per object are allowed to be undefined or increasing (default: 5).                                                                                                                                                                                                               |
| `concave-up`       | Checks whether the drawn function is concave and upward-facing.                         | `free-draw`, `line`, `polyline`, `spline`                           | This check is performed by dividing each graded object individually into 100 equally sized intervals and checking the shape of each one. Note that `line` and `polyline` objects are not considered to be concave, so they always fail this criterion. `tolerance`: how many segments per object are allowed to be undefined or not concave/upward-facing (default: 10).                                                                             |
| `concave-up`       | Checks whether the drawn function is concave and downward-facing.                       | `free-draw`, `line`, `polyline`, `spline`                           | This check is performed by dividing each graded object individually into 100 equally sized intervals and checking the shape of each one. Note that `line` and `polyline` objects are not considered to be concave, so they always fail this criterion. `tolerance`: how many segments per object are allowed to be undefined or not concave/downward-facing (default: 10).                                                                           |
| `match-length`     | Checks whether the drawn line has the specified length.                                 | `line`                                                              | `length`: reference length (in canvas units). `tolerance`: maximum allowed difference (in pixels) between the line's length and the expected length (default: 15).                                                                                                                                                                                                                                                                                   |
| `match-angle`      | Checks whether the drawn line has the specified angle with respect to the x-axis.       | `line`                                                              | `angle`: expected angle in degrees. `allow-flip`: If `true` (default: `false`), the angle and the angle + 180 degrees are considered correct (i.e., endpoints of the line can be flipped). `tolerance`: maximum allowed difference (in degrees) between the line's angle and the expected angle (default: 15).                                                                                                                                       |

### Symbolic function definitions

Some grading criteria can be used with symbolic function definitions. These are provided as a string in the `fun` attribute and must use Python expression syntax. They must use `x` as input variable name. Basic arithmetic operations (`+`, `-`, `*`, `/`, and `**` for exponentiation), parentheses, the constants `e` and `pi`, and the following Python function calls are supported: `abs`, `sign`, `sqrt`, `log`, `sin`, `cos`, `tan`, `sinh`, `cosh`, `tanh`, `asin`, `acos`, `atan`, `atan2`, `asinh`, `acosh`, and `atanh`. For example, one could write: `fun="x**2 + 2*x - sin(pi*x)"`.

If the `fun-x-y-flip` attribute is set to `true` for a grading criterion, the provided function `fun` is treated as a curve `x = f(y)`. This special purpose flag can be useful for grading vertically defined curves, such as `x = y**2`, but should be used with caution as it changes the semantics of the grading criteria it is set for. Most importantly, if `fun-flip-x-y` is `true`, `less-than` and `greater-than` should be interpreted as "left of" and "right of" respectively, and refer to x-coordinates rather than y-coordinates. The attribute `yrange` should be used instead of `xrange`, and the attribute `y` of the `less-than` and `greater-than` criteria is not supported. The `fun` attribute should also be defined with respect to `y` as the input variable.

For example, a tag with attributes `fun-flip-x-y="true" type="less-than" fun="y**2"` can be used test if the student's submitted drawing is left of the curve `x = y**2`. Another example is in the `Examples` section below.

### Optional grading stages

By default, all grading criteria are treated as entirely independent. However, in some cases, it might be desirable that a grading criterion only awards points if a different criterion has already passed. For example, one might not want to award students points for _not_ defining a function in a certain range (checked via `undefined-in`) unless they have also defined it in the correct range (checked via `defined-in`). To enforce such dependencies, criteria can be assigned a numeric `stage` attribute.

For a criterion to be even checked during grading, all criteria with a lower stage number need to pass first. Note that all criteria are considered when determining achievable points, unless they are defined with `weight="0"`. For the previous example, the `defined-in` tag could be assigned `stage="1"` and `undefined-in` tag could be assigned `stage="2"`. Any remaining criteria without an assigned stage are always checked and do not need to pass for any staged checks.

## Adding predefined objects with `pl-sketch-initial`

Initial drawings can be added to the canvas, both for read-only elements and ones that can be edited by students. Depending on whether the tool used for the initial drawing has `read-only="true"` set, the added objects are fixed or can be edited by students.

| Parameter     | Type                    | Description                                                                                                                                                                                                                                                      |
| ------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `toolid`      | string                  | `id` of the tool to be used for this initial drawing.                                                                                                                                                                                                            |
| `coordinates` | string                  | Comma-separated list of coordinates (e.g., `-4.5`, `0,1,2,3`, or `(0,1),(2,3)`) to be used for the drawing. Parentheses can be used for readability, but are ignored during rendering. See below in the `Examples` section how this can be used.                 |
| `fun`         | string                  | Symbolic function definition (see below) to be used to draw a `spline` or `free-draw` object. Only one of `coordinates` and `fun` can be used.                                                                                                                   |
| `xrange`      | string (default: `","`) | Interval for which the function definition should be plotted as a comma-separated pair of numbers, e.g. `"-3,1.5"`. Only applicable if `fun` is used. Start and/or end of the range can be blank (e.g., `"-3,"` or `",-3"`) to extend to the edge of the canvas. |

Note that the number and interpretation of coordinates depends on the type of tool that is referenced. The `vertical-line` and `horizontal-line` tools only require a single coordinate (`x` or `y`). The `point` tool needs 2 coordinates `(x,y)`, `line` needs 4 total (`(x1,y1),(x2,y2)`), and complex line tools or `polygon` need an even number of 4 or more total coordinates that represent x-y-pairs of points connected by the line. Multiple tags can reference the same tool to create independent drawings (e.g., multiple points or lines).

### Rendering symbolic functions with `pl-sketch-initial`

In addition to drawing individual coordinates, `pl-sketch-initial` also supports rendering a function based on a given symbolic definition. Functions can only be rendered using a `spline` or `free-draw` type tool, and are converted into a series of line fragments before being sent to the client, so the symbolic definition is not revealed to the student.

For details on what types of symbolic expressions are supported, see the relevant section in `pl-sketch-grade`. Note that functions are rendered as one continuous line, so for non-continuous functions, it might be necessary to split them into multiple continuous intervals to avoid visual artifacts. For example:

```html
<pl-sketch-initial fun="1/x**3"></pl-sketch-initial>
```

should be defined as:

```html
<pl-sketch-initial fun="1/x**3" xrange="-5,0"></pl-sketch-initial>
<pl-sketch-initial fun="1/x**3" xrange="0,5"></pl-sketch-initial>
```

to avoid the left and right hand side of the vertical asymptote being connected.

### Examples

`pl-sketch-tool`

Here is an example of all the default tools, along with the corresponding code that would produce this setup.

<img src="sketch_readme_images/all_tools.png" width="500">

```html
<pl-sketch answers-name="default-tools-demo" xrange="-4.5, 4.5" yrange="-1,5" graph-height="300">
  <pl-sketch-tool type="point"></pl-sketch-tool>
  <pl-sketch-tool type="vertical-line"></pl-sketch-tool>
  <pl-sketch-tool type="horizontal-line"></pl-sketch-tool>
  <pl-sketch-tool type="polyline"></pl-sketch-tool>
  <pl-sketch-tool type="line"></pl-sketch-tool>
  <pl-sketch-tool type="polygon"></pl-sketch-tool>
  <pl-sketch-tool type="free-draw"></pl-sketch-tool>
  <pl-sketch-tool type="spline"></pl-sketch-tool>
</pl-sketch>
```

In this example we create two separate tools that inherit from the `free-draw` tool. They are distinguished using the `color` parameter.

```html
<pl-sketch answers-name="demo-5" xrange="-4.5, 4.5" yrange="-2.5, 2.5">
  <pl-sketch-tool type="free-draw" id="f-orange" label="f(x)" color="orange"></pl-sketch-tool>
  <pl-sketch-tool type="free-draw" id="f-red" label="g(x)" color="red"></pl-sketch-tool>
</pl-sketch>
```

Note that when creating custom tools, setting the `id` parameter is required (and setting the `label` parameter is suggested in order to make the tools distinguishable from each other).

`pl-sketch-grade`

This question utilizes the lt-y (less than y) and gt-y (greater than y) graders to make sure the student understands key aspects of how derivatives work.

```html
<pl-question-panel>
  <p>Sketch the derivative of f(x) = x^2.</p>
</pl-question-panel>
<pl-sketch answers-name="demo-2" xrange="-3, 3" yrange="-1,6">
  <pl-sketch-tool type="free-draw" id="fx" label="Function Draw"></pl-sketch-tool>
  <pl-sketch-grade type="less-than" toolid="fx" y="0" xrange="-3,0" weight="2"></pl-sketch-grade>
  <pl-sketch-grade type="greater-than" toolid="fx" y="0" xrange="0,3" weight="2"></pl-sketch-grade>
</pl-sketch>
```

This question uses various graders to check that the function has the required shape. It requires the points $(0,0)$,
$(1,1)$, $(-1,1)$, $(2,4)$ and $(-2,4)$ to be hit by the free-draw tool. The general ranges where the function increases and decreases are given more weight for grading.

```html
<pl-question-panel>
<p>
 Sketch the function f(x) = x^2.
</p>
</pl-question-panel>
<pl-sketch answers-name="demo-3" xrange="-3, 3" yrange="-1, 6">
   <pl-sketch-tool type="free-draw" id="fx" label="Function Draw"><pl-sketch-tool>
   <pl-sketch-grade type="concave-up" toolid = "fx" weight="1"><pl-sketch-grade>
   <pl-sketch-grade type="monot-decreasing" toolid = "fx" xrange=",0" weight="2"><pl-sketch-grade>
   <pl-sketch-grade type="monot-increasing" toolid = "fx" xrange="0," weight="2"><pl-sketch-grade>
   <pl-sketch-grade type="match" toolid = "fx" x="0" y="0" weight="1"><pl-sketch-grade>
   <pl-sketch-grade type="match" toolid = "fx" x="1" y="1" weight="1"><pl-sketch-grade>
   <pl-sketch-grade type="match" toolid = "fx" x="-1" y="1" weight="1"><pl-sketch-grade>
   <pl-sketch-grade type="match" toolid = "fx" x="2" y="4" weight="1"><pl-sketch-grade>
   <pl-sketch-grade type="match" toolid = "fx" x="-2" y="4" weight="1"><pl-sketch-grade>
</pl-sketch>
```

`pl-sketch-initial`

Here are some examples of initial objects and how they can be created. Note that the initial object drawn with the free-draw tool with id "fun" does not appear in the tool bar because the tool is set with the parameter `read-only` equal to "True". It also cannot be edited. Parentheses are not necessary.

<img src="sketch_readme_images/initials.png" width="600">

```html
<pl-sketch answers-name="initials">
  <pl-sketch-tool type="free-draw" id="fun" color="blue"></pl-sketch-tool>
  <pl-sketch-tool type="free-draw" id="coords" color="purple"></pl-sketch-tool>
  <pl-sketch-tool type="point"></pl-sketch-tool>
  <pl-sketch-tool type="horizontal-line" read-only="true"></pl-sketch-tool>
  <pl-sketch-tool type="line" read-only="true"></pl-sketch-tool>
  <pl-sketch-tool type="polygon"></pl-sketch-tool>
  <pl-sketch-initial toolid="fun" fun="-1/3*x**3" xrange="-2,2"></pl-sketch-initial>
  <pl-sketch-initial toolid="coords" coordinates="-2,4,-1,1,0,0,1,1,2,4"></pl-sketch-initial>
  <pl-sketch-initial toolid="pt" coordinates="(0,0),(1,1)"></pl-sketch-initial>
  <pl-sketch-initial toolid="hl" coordinates="-2, 2, 4"></pl-sketch-initial>
  <pl-sketch-initial
    toolid="line"
    coordinates="-2, 2, -1, -2.5, -1, -2.5, -3, -4"
  ></pl-sketch-initial>
  <pl-sketch-initial toolid="polygon" coordinates="0,0,0,1,1,1,1,0"></pl-sketch-initial>
</pl-sketch>
```

`fun-x-y-swap`

In this example, we want the students to draw a function that is written in terms of y instead of x, so we need to use 'y' as our variable in the `fun` parameter, and make sure `fun-x-y-swap` is set to `"true"`. We also need to write bounds in terms of y, using the `yrange` parameter instead of `xrange`. The following image includes a sample answer that is considered correct with these settings.

<img src="sketch_readme_images/xyswap.png" width="600">

```html
<pl-sketch answers-name="x-y-swap" graph-width="450">
  <pl-sketch-tool type="free-draw"></pl-sketch-tool>
  <pl-sketch-grade
    type="match-fun"
    toolid="fd"
    fun="y**2"
    fun-x-y-swap="true"
    yrange="-2,2"
  ></pl-sketch-grade>
</pl-sketch>
```

`More Examples`

You can create static graphs that are not editable by the student and act as material using the `read-only` attribute. Here is an example:

<img src="sketch_readme_images/fill_the_blank.png" width="600">

```html
<pl-sketch answers-name="readonly-1" read-only="true" xrange="-1,7" yrange="-4,4">
  <pl-sketch-tool type="line-tool" id="bline" color="black"></pl-sketch-tool>
  <pl-sketch-initial toolid="bline" coordinates="0,0,2,2"></pl-sketch-initial>
  <pl-sketch-initial toolid="bline" coordinates="2,2,4,2"></pl-sketch-initial>
  <pl-sketch-initial toolid="bline" coordinates="4,2,7,2"></pl-sketch-initial>
</pl-sketch>

<pl-question-panel>
  <p>
    Answer the following questions about the graph above, f(x). Enter "undefined" if an answer is
    undefined.
  </p>
</pl-question-panel>
<pl-question-panel><p>What is the value of the derivative of f(x) at x = 1?</p></pl-question-panel>
<pl-string-input answers-name="q1" correct-answer="1" size="15" remove-spaces="true">
</pl-string-input>

<pl-question-panel><p>What is the value of the derivative of f(x) at x = 3?</p></pl-question-panel>
<pl-string-input answers-name="q2" correct-answer="0" size="15" remove-spaces="true">
</pl-string-input>

<pl-question-panel><p>What is the value of the derivative of f(x) at x = 5?</p></pl-question-panel>
<pl-string-input answers-name="q3" correct-answer="-4/3" size="15" remove-spaces="true">
</pl-string-input>

<pl-question-panel><p>What is the value of the derivative of f(x) at x = 2?</p></pl-question-panel>
<pl-string-input
  answers-name="q4"
  correct-answer="undefined"
  remove-spaces="true"
  ignore-case="true"
  size="15"
>
</pl-string-input>
```

Here is another use case of `"read-only"`, where static graphs are multiple choice options:

<img src="sketch_readme_images/mcq.png" width="600">

```html
<pl-sketch
  answers-name="readonly-2"
  read-only="true"
  xrange="-1,7"
  yrange="-4,4"
  graph-width="350"
  graph-height="400"
>
  <pl-sketch-tool type="line" id="bline" color="black"></pl-sketch-tool>
  <pl-sketch-initial toolid="bline" coordinates="0,0,2,2"></pl-sketch-initial>
  <pl-sketch-initial toolid="bline" coordinates="2,2,4,2"></pl-sketch-initial>
  <pl-sketch-initial toolid="bline" coordinates="4,2,7,-2"></pl-sketch-initial>
</pl-sketch>

<pl-question-panel>
  <p>Which of the following graphs resembles the derivative of the graph above, f(x)?</p>
</pl-question-panel>

<div class="row">
  <div class="col-4">
    A.
    <pl-sketch
      answers-name="s-1"
      read-only="true"
      xrange="-1,7"
      yrange="-4,4"
      graph-width="280"
      graph-height="320"
    >
      <pl-sketch-tool type="free-draw" id="curve" color="black"></pl-sketch-tool>
      <pl-sketch-tool type="point" id="hp" hollow="true"></pl-sketch-tool>
      <pl-sketch-initial toolid="curve" fun="1/2*x**2" xrange="0,2"></pl-sketch-initial>
      <pl-sketch-initial toolid="curve" coordinates="2,2,4,4"></pl-sketch-initial>
      <pl-sketch-initial toolid="curve" fun="-2/3*(x-4)**2" xrange="4,7"></pl-sketch-initial>
      <pl-sketch-initial toolid="hp" coordinates="4,4"></pl-sketch-initial>
      <pl-sketch-initial toolid="hp" coordinates="4,0"></pl-sketch-initial>
    </pl-sketch>
  </div>
  <div class="col-4">
    B.
    <pl-sketch
      answers-name="s-2"
      read-only="true"
      xrange="-1,7"
      yrange="-4,4"
      graph-width="280"
      graph-height="320"
    >
      <pl-sketch-tool type="line" id="bline" color="black"></pl-sketch-tool>
      <pl-sketch-tool type="point" id="hp" hollow="true"></pl-sketch-tool>
      <pl-sketch-initial toolid="bline" coordinates="0,1,2,1"></pl-sketch-initial>
      <pl-sketch-initial toolid="bline" coordinates="2,0,4,0"></pl-sketch-initial>
      <pl-sketch-initial toolid="bline" coordinates="4,-1.33,7,-1.33"></pl-sketch-initial>
      <pl-sketch-initial toolid="hp" coordinates="2,1"></pl-sketch-initial>
      <pl-sketch-initial toolid="hp" coordinates="2,0"></pl-sketch-initial>
      <pl-sketch-initial toolid="hp" coordinates="4,0"></pl-sketch-initial>
      <pl-sketch-initial toolid="hp" coordinates="4,-1.33"></pl-sketch-initial>
    </pl-sketch>
  </div>
  <div class="col-4">
    C.
    <pl-sketch
      answers-name="s-3"
      read-only="true"
      xrange="-1,7"
      yrange="-4,4"
      graph-width="280"
      graph-height="320"
    >
      <pl-sketch-tool type="line" id="bline" color="black"></pl-sketch-tool>
      <pl-sketch-initial toolid="bline" coordinates="0,0,2,2"></pl-sketch-initial>
      <pl-sketch-initial toolid="bline" coordinates="2,2,4,2"></pl-sketch-initial>
      <pl-sketch-initial toolid="bline" coordinates="4,2,7,-2"></pl-sketch-initial>
    </pl-sketch>
  </div>
</div>

<pl-multiple-choice answers-name="mcq">
  <pl-answer correct="false">A</pl-answer>
  <pl-answer correct="true">B</pl-answer>
  <pl-answer correct="false">C</pl-answer>
</pl-multiple-choice>
```
