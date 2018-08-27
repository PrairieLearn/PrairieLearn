
# PrairieDraw

The PrairieDraw library (`PrairieDraw.js`) is a figure-drawing library which allows dynamic figures to be rendered through the `pl-prairiedraw-figure` element (see [here](elements.md#pl-prairiedraw-figure-element)).

Any parameters passed to the script from the `params-names` option in the `pl-prairiedraw-figure` element can be accessed with `this.params.get([parameter])`

## `Sylvester.js` library and selected methods

PrairieDraw uses the `Sylvester.Vector` class to specify positions and directions for drawing; any Vector-type arguments listed below are of this type.

Below is an incomplete selection of useful operations on Vector; the complete documentation is found [here](http://sylvester.jcoglan.com/docs.html).

`Sylvester.Vector.create(elements)`
Creates and returns a new Vector from the array `elements`. It is often useful to alias this command in your script as `var $V = Sylvester.Vector.create` so you can write `$V([x,y])` later on.

`add(vector)`
Returns a new Vector which is the sum of the receiver and the argument.

`subtract(vector)`
Returns a new Vector which is the difference between the receiver and argument; i.e., `a.subtract(b)` returns the vector difference `a-b`.

`multiply(scalar)` or `x(scalar)`
Returns a new Vector which is the receiver scaled by the argument. `a.multiply(k)` and `a.x(k)` are equivalent.

`dot(vector)`
Returns the scalar product of the receiver and argument.

`cross(vector)`
Returns a new Vector which is the cross product in left-to-right order; i.e., `A.cross(B)` returns `A x B`.

`modulus()`
Returns the (2)-norm of the vector.

`toUnitVector()`
Returns a new Vector which is the receiver scaled to have modulus one.

`rotate(angle, axis)`
Returns a new Vector formed by rotating the receiver counterclockwise through `angle` (in radians), using the Vector `axis` as a center point. E.g.,
```javascript
a = $V([10,5]);
b = $V([5,5]);
c = a.rotate(Math.PI / 2, b) // c = [5, 10]
```

## `PrairieDraw.js` library

The script provided by `script_name` may access the PrairieDraw figure via `this.pd`. The operations below allow for changing the orientation or scaling of the figure, as well as adding drawing elements to it.

In general, drawing objects are opaque, so the order in which items are added affects the final appearance of the figure.

Below is an incomplete list of operations available from PrairieDraw; the library source code can be found [here](https://github.com/PrairieLearn/PrairieLearn/blob/master/public/javascripts/PrairieDraw.js).

## Constants provided by PrairieDraw

`goldenRatio`
Returns the golden ratio; useful for creating pleasantly-proportioned figures in the arguments to `setUnits`.

`milesPerKilometer`
Returns a conversion factor of 0.621371

## Setting and changing the coordinate system

`setUnits(xSize, ySize [, canvasWidth, preserveCanvasSize])`
Sets the size of the canvas in drawing units, with the origin at the center of the drawing. The optional `canvasWidth` argument specifies (in pixels) the width of the figure, while `preserveCanvasSize` prevents reshaping the canvas to match the coordinate ratio.

`scale(factor)`
Scale drawing coordinates by the given factor (i.e., the relationship between coordinates and pixels).

`translate(offset)`
Translate the origin of the coordinate system by the Vector `offset`.

`rotate(angle)`
Rotate the coordinate system counterclockwise by `angle` radians.

`transformByPoints(old1, old2, new1, new2)`
Perform a combination of `scale`, `translate`, and `rotate` such that Vector points `old1` and `old2` are mapped to `new1` and `new2`.

## Drawing object options

Some drawing objects below have the optional `type` argument to specify a physical meaning for the line/arrow. When specified, a corresponding color is chosen for the object based on the TAM 2XX style guide [here](http://dynref.engr.illinois.edu/rvn.html#rvn-sc). 

Type | Color 
 --- | --- 
`grid` | `rgb(200,200,200)`
`position` | `rgb(0,0,255)`
`angle` | `rgb(0,100,180)`
`velocity` | `rgb(0,200,0)`
`angVel` | `rgb(100,180,0)`
`acceleration` | `rgb(255,0,255)`
`rotation` | `rgb(150,0,150)`
`angAcc` | `rgb(100,0,180)`
`angMom` | `rgb(255,0,0)`
`force` | `rgb(210,105,30)`
`moment` | `rbg(255,102,80)`

The optional `filled` argument (default is false) is a boolean to specify if the shape should be shaded.

## Drawing points and lines

`point(vector)`
Draw a point at the coordinates given by `vector`.

`line(start, end [, type])`
Draw a line segment from Vector position `start` to `stop`. 

`polyline(points [, closed, filled])`
Draw a series of line segments connecting the array of `points`. The optional arguments (defaulting to false) determine if the polyLine should be closed by a line connecting the first and last elements of `points`.

`arc(center, radius, startAngle, endAngle [, filled, aspect])`
Draw an arc of a circle centered at `center`, with radius `radius`, from angle `startAngle` to `endAngle` (in radians). When `aspect` is provided, the arc is drawn for an ellipse with major axis `radius` and minor axis `radius / aspect` (i.e., `aspect` is major / minor).

`circle(center, radius [, filled])`
Draws a circle centered at `center` with radius `radius`.

`rectangle(width, height [, center, angle, filled])`
Draw a rectangle (aligned to the axes) of the given width and height. When not specified, `center` is assumed to be the origin. An `angle` to rotate can also be given.

`rectangleGeneric(bottomLeft, bottomRight, height)`
Draw a rectangle with one side connecting `bottomLeft` and `bottomRight` of the given `height`. The rectangle extends perpendicular (counter-clockwise) to this line.

## Drawing vector arrows

`arrow(start, end [, type])`
Draw an arrow from `start` to `stop` (with arrowhead at `stop`).

`arrowFrom(start, offset [, type])`
Draw an arrow from `start` to `start.add(offset)`.

`arrowTo(end, offset [, type])`
Draw an arrow from `end.subtract(offset)` to `end`.

`arrowOutOfPage(vector [, type])`
Draw an arrow out of the screen (circle with center dot) at `vector`.

`arrowIntoPage(vector [, type])`
Draw an arrow into the screen (circle with center x) at `vector`.

`circleArrow(center, radius, startAngle, endAngle [, type, fixedRad, idealSegmentSize])`
Draw an arrow arc centerd at `center`, with radius `radius`, from `startAngle` to `endAngle` (in radians). The `fixedRad` option (default false) specifies if a constant radius should be used (as opposed to curling in the beginning/end).

`circleArrowCentered(center, radius, centerAngle, extentAngle [, type, fixedRad])`
Draw an arrow arc centered at `center`, with radius `radius`, centerd at `centerAngle` and spanning `extentAngle` (in radians).

`triangularDistributedLoad(start, end, startSize, endSize, startLabel, endLabel, arrowToLine, arrowDown)`
This creates a (trapezoidal) distributed load acting on the line between `start` and `end`, with height `startSize` at one side and `endSize` at the other and corresponding labels `startLabel` and `endLabel`. `arrowToLine` is true if the arrowheads point towards the line between `start` and `end`, and false otherwise. `arrowDown` is true if the arrowheads point down (negative y direction) and false otherwise. These last two options determine whether arrows appear above or below the line.

This function assumes the line from `start` to `end` is horizontal, and has unexpected behaviors when it does not.

## Drawing mechanical shapes

`rod(start, end, width)`
Draws a rod with endpoint pins at `start` and `end`. The rounded ends of the rod will extend slightly beyond these points.

`LshapeRod(start, middle, end, width)`
Draws an L-shaped rod with endpoints `start` and `end` and corner at `middle`.

`TshapeRod(start, center, end, centerEnd, width)`
Draws a T-shaped rod with hinges at the four points listed. To draw a well-formed rod with three arms, let `center` be the intersection of the arms and the order `start`, `end`, `centerEnd` represent the clockwise ordering of the three endpoints.

`pivot(baseCenter, center, width)`
Creates a pivot base with hinge point at `center` and other end at `baseCenter`. When combined with `ground` below, `baseCenter` is usually the midpoint of the ground element.

`ground(baseCenter, normal, width)`
Draws a (shaded) ground element centered at `baseCenter` and width `width`. The direction of `normal` is perpendicular to and away from the ground.

`arcGround(center, radius, startAngle, endAngle, outside)`
Draws a curved ground element with arguments similar to the `arc` command above. `outside` is `true` if the shading goes on the outside of the curve, and `false` otherwise.

## Drawing text and/or LaTex labels

See [below](PrairieDraw.md#generating-latex-labels-on-figures) for instructions on formatting the `text` argument in these commands.

`text(position, anchor, text [, boxed, angle])`
Draws text at the given `position`. `anchor` is a Vector with components from (-1,0,1) specifying alignment; i.e., `$V([-1,-1])` corresponds to "left" and "bottom" alignment for the text; `$V([1,1])` corresponds to "right" and "above". Optional `boxed` frames the text, and `angle` rotates it in place.

`labelLine(start, end, pos, text [, anchor])`
Places text along the line between `start` and `end`. `pos` takes values in local coordinates from (-1,1) specifying the position along and above/below the line. The optional `anchor` uses the same pattern as above.

`labelCircleLine(center, radius, startAngle, endAngle, pos, text)`
Places text along the arc specified by `center`, `radius`, `startAngle`, and `endAngle`. `pos` takes values in local coordinates from (-1,1) along and above/below the curve.

## Generating LaTeX labels on figures

When using `PrairieDraw.js` to draw figures in questions, figure labels can be included using either plain text, like `pd.text(..., "label")`, or with LaTeX, like `pd.text(..., "TEX:$x$")`. If you are using LaTeX labels then they have to be rendered into image files before they can be displayed. This is done by running the command:

```sh
docker run -it --rm -v PATH_TO_MY_COURSE:/course prairielearn/prairielearn /PrairieLearn/tools/generate_text.py
```

Replace `PATH_TO_MY_COURSE` above with your local course path directory, such as `/Users/mwest/git/pl-tam212` or `C:/GitHub/pl-tam212`.

LaTeX labels are searched for by looking for strings of the form `"TEX:..."` or `'TEX:...'` (note the different quote types). Use the `""` form if you want to have `'` characters in the string itself, and vice versa.

The above command needs to be repeated after any LaTeX labels are added or changed in questions.

The LaTeX label images will be filenames that look like:

```text
pl-tam212/questions/QID/text/186b41e2a92b8b22694dda1305699937df032555.png
pl-tam212/questions/QID/text/186b41e2a92b8b22694dda1305699937df032555_hi.png
pl-tam212/questions/QID/text/d68de4af4e4de5858554f8a90c5a519d9d435589.png
pl-tam212/questions/QID/text/d68de4af4e4de5858554f8a90c5a519d9d435589_hi.png
```

These files should be committed to the `git` repository and pushed to the live server so that they are available along with the question.

## Advanced: Running without Docker

If you want to generate LaTeX label images without docker then you will need to install [Python](https://www.python.org),  [ImageMagick](http://www.imagemagick.org/), and [LaTeX](http://tug.org/texlive/) and then run:

```sh
cd <FULL-PATH>/PrairieLearn
python tools/generate_text.py --subdir /path/to/course
```
