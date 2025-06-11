# Python Reference

![Codecov](https://codecov.io/github/prairielearn/prairielearn/graph/badge.svg?token=50XtugkgLU&flag=python)

These helpers are available in the Python environment when running a PrairieLearn question or element. They are organized by category. The most commonly used helpers are the [grading](./prairielearn/grading_utils.md), [conversion](./prairielearn/conversion_utils.md), and [question](./prairielearn/question_utils.md) helpers.

Here are the recommended ways to import the helpers:

```python
import prairielearn as pl
from prairielearn.colors import Y
from prairielearn.to_precision import Z
import prairielearn.sympy_utils as psu
```

??? info "More info"

    You can use the following import to access most of the helpers:

    ```python
    from prairielearn import ...
    ```

    These modules must be imported directly:

    ```python
    from prairielearn.colors import Y
    from prairielearn.to_precision import Z
    from prairielearn.sympy_utils import Z
    ```

    You should **not** directly import the remaining dotted modules (e.g. `prairielearn.conversion_utils`), as they do not have a stable interface.

!!! warning

    The following imports are now deprecated. They will be removed in a future release. Please update your code to use the new imports

    === "Old"

        ```python
        import colors
        import to_precision
        import python_helper_sympy
        ```

    === "New"

        ```python
        import prairielearn.colors
        import prairielearn.to_precision
        import prairielearn.sympy_utils
        ```

<!-- prettier-ignore -->
::: prairielearn
    options:
        members:
            - misc_utils
            - sympy_utils
            - extension_utils
            - question_utils
            - grading_utils
            - conversion_utils
            - html_utils
            - colors
