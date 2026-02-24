# `pl-prairiedraw-figure` element

Create and display a prairiedraw image.

!!! warning

    This element is **deprecated** and should not be used in new questions.

## Sample element

```html title="question.html"
<pl-prairiedraw-figure
  script-name="drawFigure.js"
  param-names="r1,r2,isHorizontal"
  width="900"
  height="600"
></pl-prairiedraw-figure>
```

## Customizations

| Attribute     | Type    | Default | Description                                                          |
| ------------- | ------- | ------- | -------------------------------------------------------------------- |
| `height`      | integer | 300     | Height of the drawing element.                                       |
| `param-names` | string  | —       | Comma-separated list of parameters to make available to PrairieDraw. |
| `script-name` | string  | —       | Name of PrairieDraw script.                                          |
| `width`       | integer | 500     | Width of the drawing element.                                        |

## Details

The provided `script-name` corresponds to a file located within the directory for the question. Parameter names are keys stored in `data["params"]` in `server.py` (i.e., those available for templating within `question.html`).

## Example implementations

- [element/prairieDrawFigure]

## See also

- [PrairieDraw graphics documentation](../PrairieDraw.md)

[element/prairiedrawfigure]: https://github.com/PrairieLearn/PrairieLearn/tree/master/testCourse/questions/prairieDrawFigure
