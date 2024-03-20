---
title: Multiple choice
summary: Allow students to select from multiple options.
---

![](figSimpleQuestion.png)

## Simple example

A simple implementation of this example only requires writing a `question.html` file. Note that the question parameters, such as the ball mass $m$, the angle $\theta$, the height $h$, the initial velocity $v_0$ and the distance $d$, have fixed values.
Consequently, the correct answer is also fixed.

```html src=simple/question.html

```

This question uses the attribute `none-of-the-above="true"` in the `pl-multiple-choice` element. This attribute adds the option "None of the above" as an alternative among the other options defined by the `pl-answer` tags. The answer "None of the above" will be true (replacing the correct answer) with $50\%$ probability.

Unfortunately, this implementation only creates one unique version of the question, with the same set of parameters and answers.
The only level of randomization comes from the order in which the answers are displayed and the choice of the "None of the above" option as correct answer.

## Complex example

To add variability to the question, we can include dynamically-generated values in `question.html` using [Mustache template syntax](https://mustache.github.io).
In this example, we can randomly generate the parameters $m$, $h$, $\theta$, $v_0$, and $d$ and compute the corresponding correct answers and distractors.

The modified `question.html` file that supports the randomization is:

```html src=complex/question.html

```

To generate the parameters, we can use the following Python code in `server.py`:

```python src=complex/server.py

```

The above script randomizes and computes several aspects of the question:

- The parameters $m$, $d$, $\theta$, and $v_0$ are generated using the Python module `random`
- The parameter $h$ is computed based on $m$, $d$, $\theta$, and $v_0$
- The choice of using the attribute `none-of-the-above` is selected at random
- The correct answer and distractors are computed using the input parameters

These values are stored in the `data["params"]` dictionary, which are used in the `question.html` template.
With the addition of `server.py` and templated values in `question.html`, we can now generate many unique variants of this question.

## More randomization!

Feeling adventurous? We can add even more variation to this question:

- We can dynamically create an image to reflect the randomly selected parameters.
- In addition to asking about the length of time the ball is in the air, we can add a second problem statement that asks the student to compute the distance the ball travels. We can then also randomly pick between the original problem statement and this new problem statement.

The modified `question.html` file that supports this additional randomization is:

```html src=advanced/question.html

```

By using the `<pl-drawing>` element instead of `<pl-figure>`, we can create a dynamic image where the orientation of the arrow is consistent with the provided angle $\theta$. The image could be easily adapted such that the height of the cliff would also vary with the value of the parameter $h$.

Also note the use of `{{params.question_text}}` to display the randomly-picked problem statement.

As before, we'll use `server.py` to generate parameters for the question:

```python src=advanced/server.py

```

Note the addition of code to generate a question and answers for the secondary problem statement.

Here's one instance of this fully randomized question:

![](figAdvancedQuestion.png)
