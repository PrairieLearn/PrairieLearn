!!! note

    The following PrairieLearn Elements have been **deprecated**. These elements are still supported for backwards compatibility, but they should not be used in new questions.

### `pl-dropdown` element

!!! warning

    Instructors are strongly encouraged to avoid `pl-dropdown` in newer questions. For questions with a single dropdown, a better alternative is to use [`pl-multiple-choice`](submission-elements.md#pl-multiple-choice-element), setting the attribute `display="dropdown"`. Using the multiple choice element provides better support for formatted option text (including Math formulas), randomized selection and ordering of options (both correct options and distractors) and partial scores for distractors. For questions using multiple dropdowns with the same set of options, the [`pl-matching`](submission-elements.md#pl-matching-element) element provides a better user experience and interface.

Select the correct answer from a drop-down **select** menu list of potential answers. The potential options are listed in the inner HTML of a <pl-answer></pl-answer> element (ie. <pl-answer>Possible Answer 1</pl-answer>).

#### Sample element

![](./pl-dropdown.png)

**question.html**

```html
<p>Select the correct word in the following quotes:</p>
The
<pl-dropdown answers-name="aristotle" blank="true">
  {{#params.aristotle}}
  <pl-answer correct="{{tag}}">{{ans}}</pl-answer>
  {{/params.aristotle}}
</pl-dropdown>
is more than the sum of its parts.
<p></p>

A
<pl-dropdown sort="ascend" answers-name="hume">
  <pl-answer correct="true">wise</pl-answer>
  <pl-answer correct="false">clumsy</pl-answer>
  <pl-answer correct="false">reckless</pl-answer>
</pl-dropdown>
man proportions his belief to the evidence.
<p></p>
```

**server.py**

```python
def generate(data):

    QUESTION1 = "aristotle"

    data["params"][QUESTION1] = [
        {"tag": "true", "ans": "whole"},
        {"tag": "false", "ans": "part"},
        {"tag": "false", "ans": "inverse"}
    ]
```

#### Customizations

| Attribute      | Type    | Default | Description                                                                                                                                                          |
| -------------- | ------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answers-name` | string  | -       | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question. |
| `weight`       | integer | 1       | Weight to use when computing a weighted average score over elements.                                                                                                 |
| `sort`         | string  | random  | Options are 'random', 'ascend', and 'descend', and 'fixed' for drop-down answers.                                                                                    |
| `blank`        | boolean | True    | Option to add blank dropdown entry as default selection in drop-down list.                                                                                           |
| `allow-blank`  | boolean | false   | Whether or not an empty submission is allowed. By default, empty dropdowns will not be graded (invalid format).                                                      |

#### Example implementation

- [demo/overlayDropdown]
- [element/dropdown]

---

### `pl-prairiedraw-figure` element

Create and display a prairiedraw image.

!!! warning

    This element is **deprecated** and should not be used in new questions.

#### Sample element

```html
<pl-prairiedraw-figure
  script-name="drawFigure.js"
  param-names="r1,r2,isHorizontal"
  width="900"
  height="600"
></pl-prairiedraw-figure>
```

#### Customizations

| Attribute     | Type    | Default | Description                                                          |
| ------------- | ------- | ------- | -------------------------------------------------------------------- |
| `script-name` | string  | -       | Name of PrairieDraw script.                                          |
| `param-names` | string  | `None`  | Comma-separated list of parameters to make available to PrairieDraw. |
| `width`       | integer | 500     | Width of the drawing element.                                        |
| `height`      | integer | 300     | Height of the drawing element.                                       |

#### Details

The provided `script-name` corresponds to a file located within the director for the question. Parameter names are keys stored in `data["params"]` in `server.py` (i.e., those available for templating within `question.html`).

#### Example implementations

- [element/prairieDrawFigure]

#### See also

- [PrairieDraw graphics documentation](../PrairieDraw.md)

### `pl-threejs` element

This element displays a 3D scene with objects that the student can (optionally) translate and/or rotate. It can be used only for output (e.g., as part of a question that asks for something else to be submitted). Or, it can be used for input (e.g., comparing a submitted pose of the body-fixed objects to a correct orientation). Information about the current pose can be hidden from the student and, if visible, can be displayed in a variety of formats, so the element can be used for many different types of questions.

!!! warning

    This element is **deprecated** and should not be used in new questions.

#### Sample element

![](./pl-threejs.png)

```html
<pl-threejs answer-name="a">
  <pl-threejs-stl file-name="MAKE_Robot_V6.stl" frame="body" scale="0.1"></pl-threejs-stl>
  <pl-threejs-stl
    file-name="MAKE_Robot_V6.stl"
    frame="body"
    scale="0.025"
    position="[-1,1,2]"
    orientation="[0,0,30]"
  ></pl-threejs-stl>
  <pl-threejs-txt frame="body" position="[-1,1,2.6]" orientation="[0,0,30]">mini-me</pl-threejs-txt>
</pl-threejs>
```

#### Customizations

| Attribute                       | Type    | Default   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------- | ------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `answer-name`                   | string  | —         | Variable name to store data in. Note that this attribute has to be unique within a question, i.e., no value for this attribute should be repeated within a question.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `body-position`                 | list    | [0, 0, 0] | Initial position of body as `[x, y, z]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `body-orientation`              | list    | special   | Initial orientation of body. Defaults to zero orientation (body frame aligned with space frame). Interpretation depends on `body-pose-format`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `camera-position`               | list    | [5, 2, 2] | Initial position of camera as `[x, y, z]`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `body-cantranslate`             | boolean | true      | If you can translate the body in the UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `body-canrotate`                | boolean | true      | If you can rotate the body in the UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `camera-canmove`                | boolean | true      | If you can move the camera (i.e., change the view) in the UI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `body-pose-format`              | string  | rpy       | Determines how `body-orientation` is interpreted. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle.                                                                                                                                                                                                                                                                                                                                                            |
| `answer-pose-format`            | string  | rpy       | Determines how the answer `data["correct_answers"][answer-name]` is interpreted. If `homogeneous`, then the answer must be a 4x4 homogeneous transformation matrix `[[...], [...], [...], [...]]`. Otherwise, the answer must be a list with two elements. The first element must describe position as `[x, y, z]`. The second element must describe orientation, interpreted based on `answer-pose-format`. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle. |
| `text-pose-format`              | string  | matrix    | Determines how the pose of the body is displayed as text. If `matrix` then position is `[x, y, z]` and orientation is a 3x3 rotation matrix. If `quaternion` then position is `[x, y, z]` and orientation is `[x, y, z, w]`. If `homogeneous` then pose is a 4x4 homogeneous transformation matrix.                                                                                                                                                                                                                                                                                                                                                      |
| `show-pose-in-question`         | boolean | true      | If the current pose of the body is displayed in the question panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `show-pose-in-correct-answer`   | boolean | true      | If the current pose of the body is displayed in the correct answer panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `show-pose-in-submitted-answer` | boolean | true      | If the current pose of the body is displayed in the submitted answer panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `tol-position`                  | float   | 0.5       | Error in position must be no more than this for the answer to be marked correct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `tol-rotation`                  | float   | 5.0       | Error in rotation must be no more than this for the answer to be marked correct.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `grade`                         | boolean | true      | If the element will be graded, i.e., if it is being used to ask a question. If `grade` is `false`, then this element will never produce any html in the answer panel or in the submission panel.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

A `pl-threejs-stl` element inside a `pl-threejs` element allows you to add a mesh described by an `stl` file to the scene, and has these attributes:

| Attribute        | Type   | Default             | Description                                                                                                                                                                                                                                                                              |
| ---------------- | ------ | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file-name`      | string | —                   | Name of `.stl` file.                                                                                                                                                                                                                                                                     |
| `file-directory` | string | clientFilesQuestion | Location of `.stl` file, either `clientFilesCourse` or `clientFilesQuestion`.                                                                                                                                                                                                            |
| `frame`          | string | body                | Which frame the object is fixed to, either `body` or `space`.                                                                                                                                                                                                                            |
| `color`          | color  | special             | Color of object as CSS string, defaults to `#e84a27` if body-fixed and to `#13294b` if space-fixed.                                                                                                                                                                                      |
| `opacity`        | float  | special             | Opacity of object, defaults to `0.7` if body-fixed and to `0.4` if space-fixed.                                                                                                                                                                                                          |
| `position`       | list   | [0, 0, 0]           | Position of object as `[x, y, z]`.                                                                                                                                                                                                                                                       |
| `orientation`    | list   | special             | Orientation of object. Defaults to zero orientation. Interpretation depends on `format`.                                                                                                                                                                                                 |
| `format`         | string | rpy                 | Determines how `orientation` is interpreted. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle. |

A `pl-threejs-txt` element inside a `pl-threejs` element allows you to add whatever text appears between the `<pl-threejs-txt> ... </pl-threejs-txt>` tags as a mesh to the scene, and has these attributes:

| Attribute     | Type   | Default   | Description                                                                                                                                                                                                                                                                              |
| ------------- | ------ | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frame`       | string | body      | Which frame the object is fixed to, either `body` or `space`.                                                                                                                                                                                                                            |
| `color`       | color  | special   | Color of object as CSS string, defaults to `#e84a27` if body-fixed and to `#13294b` if space-fixed.                                                                                                                                                                                      |
| `opacity`     | float  | special   | Opacity of object, defaults to `0.7` if body-fixed and to `0.4` if space-fixed.                                                                                                                                                                                                          |
| `position`    | list   | [0, 0, 0] | Position of object as `[x, y, z]`.                                                                                                                                                                                                                                                       |
| `orientation` | list   | special   | Orientation of object. Defaults to zero orientation. Interpretation depends on `format`.                                                                                                                                                                                                 |
| `format`      | string | rpy       | Determines how `orientation` is interpreted. If `rpy` then `[roll, pitch, yaw]`. If `matrix` then 3x3 rotation matrix `[[...], [...], [...]]`. If `quaternion` then `[x, y, z, w]`. If `axisangle` then `[x, y, z, theta]` where `x, y, z` are coordinates of axis and `theta` is angle. |

#### Details

Note that a 3D scene is also created to show each submitted answer. This means
that if there are many submitted answers, the page will load slowly.

#### See also

- [External: `three.js` JavaScript library](https://threejs.org/)

<!-- Misc application questions -->

### `pl-variable-score` element

Display the partial score for a specific answer variable.

!!! warning

    This element is **deprecated** and should not be used in new questions.

#### Sample element

```html
<pl-variable-score answers-name="v_avg"></pl-variable-score>
```

#### Customizations

| Attribute      | Type   | Default | Description                         |
| -------------- | ------ | ------- | ----------------------------------- |
| `answers-name` | string | —       | Variable name to display score for. |

{!elements/reference-links.md!}
