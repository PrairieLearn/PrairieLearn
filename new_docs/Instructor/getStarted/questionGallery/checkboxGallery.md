# Question type: Checkbox


The example below uses checkboxes to collect a user's submission.

## Example: select the locations where the function is positive

![](checkbox_render.png)

### Simple implementation without randomization

In this simple implementation, we only need to write the HTML file `question.html`:

```html
<pl-question-panel>
<p> The function $f(x) = -x^3 + x^2 + 10x - 9$ is illustrated below.  
Select the values of $x$ corresponding to positive function values.</p>

<pl-figure file-name=static_image.png directory='clientFilesQuestion'></pl-figure>
</pl-question-panel>

<pl-checkbox answers-name="select" hide-letter-keys="true" fixed-order="true" >
    <pl-answer correct="true">  $x = -4$ </pl-answer>
    <pl-answer correct="false"> $x = 0$ </pl-answer>
    <pl-answer correct="true">  $x = 2$ </pl-answer>
    <pl-answer correct="false"> $x = 6$ </pl-answer>
</pl-checkbox>
```

The plot is added from a static image `static_image.png` using the element `pl-figure`. We use `pl-checkbox` to add the possible answers that can be selected by the user, including the correct answers and distractors.



### Implementation with randomized parameters

#### question.html

The same example can be generated using randomized parameters, as illustrated in this `question.html` file:

```html
<pl-question-panel>
<p> The function $f(x) = {{params.f}}$ is illustrated below.
Select the values of $x$ corresponding to {{params.option}} function values.</p>
<pl-figure file-name=figure.png type="dynamic"></pl-figure>
</pl-question-panel>

<pl-checkbox answers-name="select" hide-letter-keys="true" number-answers=4>
    <pl-answer correct={{params.x0}}> $x = -6$ </pl-answer>
    <pl-answer correct={{params.x1}}> $x = -4$ </pl-answer>
    <pl-answer correct={{params.x2}}> $x = -2$ </pl-answer>
    <pl-answer correct={{params.x3}}> $x = 0$ </pl-answer>
    <pl-answer correct={{params.x4}}> $x = 2$ </pl-answer>
    <pl-answer correct={{params.x5}}> $x = 4$ </pl-answer>
    <pl-answer correct={{params.x6}}> $x = 6$ </pl-answer>
</pl-checkbox>
```


**1) Randomized function $f(x)$**

This example generates functions $f(x)$ of the form:

$$ f(x) = a x^3 + b x^2 + c x - 9 $$

where the parameters $a,b,c$ are generated in `server.py`. The latex expression is stored as the variable `f` in the  `data["params"]` dictionary:

```html
The function $f(x) = {{params.f}}$ is illustrated below.
```

**2) Randomized expected sign for correct answers**

The correct answers can correspond to either *negative* or *positive* function values. This option is stored as variable `option` in the `data["params"]` dictionary:

```html
Select the values of $x$ corresponding to {{params.option}} function values.
```

**3) Dynamic plot for the randomized function**

Once the function $f(x)$ is generated in `server.py`, the corresponding plot is also created and saved as `figure.png`.

```html
<pl-figure file-name=figure.png type="dynamic"></pl-figure>
```

**4) Checkbox answers matching the randomized parameters**

The correct answers depend on the variables `f` and `option`. The boolean values for each answer (e.g. $x = -6$) are stored as parameters in the `data` dictionary (e.g `params.x0`). We use the attribute `number-answers=4` so that only 4 out of the 7 possible answers are displayed.


```html
<pl-checkbox answers-name="select" hide-letter-keys="true" number-answers=4>
    <pl-answer correct={{params.x0}}> $x = -6$ </pl-answer>
    <pl-answer correct={{params.x1}}> $x = -4$ </pl-answer>
    <pl-answer correct={{params.x2}}> $x = -2$ </pl-answer>
    <pl-answer correct={{params.x3}}> $x = 0$ </pl-answer>
    <pl-answer correct={{params.x4}}> $x = 2$ </pl-answer>
    <pl-answer correct={{params.x5}}> $x = 4$ </pl-answer>
    <pl-answer correct={{params.x6}}> $x = 6$ </pl-answer>
</pl-checkbox>
```

#### server.py

The parameters that appear in the `question.html` file are defined in `server.py `. Let us first assume that
we will not display the plot for the function $f(x)$ (i.e., not include the `pl-figure` element). In that case, the code in `server.py` can be written as:


```python
import random
import numpy as np
import sympy as sym

def generate(data):

    # generating the coefficients for the function
    a = random.choice([-1,0,1])
    b = random.choice([-1,1])
    c = random.choice([10,-10])

    data['params']['a'] = a
    data['params']['b'] = b
    data['params']['c'] = c

    # Generate the function for display
    x = sym.symbols('x')
    data['params']['f'] = sym.latex(a*x**3 + b*x**2 + c*x - 9)

    # Generate question parameter
    option = np.random.choice(["positive", "negative"])
    data['params']['option'] = option

    # Generate x and y values for the checkbox options
    xp = np.array([-6,-4,-2,0,2,4,6])
    yp = a*x**3 + b*x**2 + c*x - 9

    # Determine the true and false options
    ysol = yp>0 if option=="positive" else yp<0
    solutions = ["true" if b else "false" for b in ysol]

    # Storing the correct answers in the data dictionary
    for i,s in enumerate(solutions):
        varName = "x" + str(i)
        data['params'][varName] = s
```

**1) Generate the random coefficients and the equation for display**


We select the coefficients $a, b, c$ from a list of possible coefficients to ensure the function
will satisfy some pre-determined requirements.
```python
a = random.choice([-1,0,1])
b = random.choice([-1,1])
c = random.choice([10,-10])
```
We use the Python library [Sympy](https://www.sympy.org/en/index.html) to create the symbolic expression for $f(x)$ and store this expression as the variable `f` in the `data['params']` dictionary:
```python
x = sym.symbols('x')
data['params']['f'] = sym.latex(a*x**3 + b*x**2 + c*x - 9)
```

**2) Generate the expected sign for the correct answers**

The variable `option` can be selected at random as "positive" or "negative":
```python
option = np.random.choice(["positive", "negative"])
data['params']['option'] = option
```

**3) Evaluate the function values for the pre-defined locations**

First we create an array with the pre-defined values for $x$ (variable `xp`), and then we evaluate the function $f(x)$
for these values.
```python  
xp = np.array([-6,-4,-2,0,2,4,6])
yp = a*x**3 + b*x**2 + c*x - 9
```
Note that we could have generated the array `xp` using randomized values for the interval $(-6,6)$. In that case, we would need to modify `question.html` to read the parametrized values for $x$.

If `option == "positive"`, then correct answers will be True when `yp>0`. In the code below, the variable `solutions`
will be a list of "true" and "false" strings, corresponding to each one of the locations.
```python
ysol = yp>0 if option=="positive" else yp<0
solutions = ["true" if b else "false" for b in ysol]
```
Finally, we can store the entries of `solution` as variables in the `data['params']` dictionary:
```python
for i,s in enumerate(solutions):
    varName = "x" + str(i)
    data['params'][varName] = s
```

**4) Create the dynamic figure**

In `pl-figure` with `type="dynamic"` the contents of the image file are returned by the function `file()` located in `server.py`.  In this example, we add the following code to generate the  "fake" image figure.png:


```python
import io
import matplotlib.pyplot as plt
import matplotlib as ml
ml.rcParams['text.usetex'] = True


def file(data):

    if data['filename']=='figure.png':

        # Generate data points for the plot
        xp = np.linspace(-6, 6, num=60)
        a = data['params']['a']
        b = data['params']['b']
        c = data['params']['c']
        yp = a*x**3 + b*x**2 + c*x - 9

        # Generate the plot
        fig, ax = plt.subplots()
        ax.plot(xp, yp)
        plt.xlabel(r"$x$")
        plt.ylabel(r"$f(x)$")
        plt.grid()
        plt.xlim(-6,6)

        # Save the figure and return it as a buffer
        buf = io.BytesIO()
        plt.savefig(buf, format='png')
        return buf
```


**ADD LINKS TO EXAMPLE COURSE AND OTHER DOCUMENTATION LOCATIONS** 
