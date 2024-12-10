# Concepts

PrairieLearn is extremely flexible and powerful, but this flexibility can appear opaque at first. This document provides an overview of the key concepts in PrairieLearn, and how they fit together.

## High-level overview

A [**course**](./course.md) in PrairieLearn is composed of **course instances** and **questions**. Each [course instance](./courseInstance.md) is an offering of a course in a particular semester/term. For example, a course "CS 225" might have instances "CS 225 Spring 2022" and "CS 225 Fall 2022". A course instance contains all the **assessments** for that particular term. The course itself contains the questions that are shared across all instances. You can think of the course as containing a bank of questions that are then used to create assessments for each instance of the course, and a way to logically organize the questions.

=== "Concept Map"

    ```d2
    --8<-- "docs/diagrams/concept-map.d2"
    ```

=== "Example for the `PrairieLearn 101` course"

    ```d2
    --8<-- "docs/diagrams/concept-map-example.d2"
    ```

### Questions

[**Questions**](./question.md) are all independent, and a given question can be used on many different assessments across many different course instances. They are written in HTML (as a [Mustache template](https://mustache.github.io/mustache.5.html)) and use [elements](./elements.md) to accept student input. Python code can be used to generate random parameters and grade questions. Student code submissions can also be graded with an [external code autograder](./externalGrading.md).

#### Example `question.html`

```html title="question.html"
<pl-question-panel>
  If $x = {{params.x}}$ and $y$ is {{params.operation}} $x$, what is $y$?
</pl-question-panel>

<pl-number-input answers-name="y" label="$y =$"></pl-number-input>
```

#### Example `server.py`

```python title="server.py"
def generate(data):
    data["params"]["x"] = random.randint(5, 10)
    data["params"]["operation"] = random.choice(["double", "triple"])

    if data["params"]["operation"] == "double":
        data["correct_answers"]["y"] = 2 * data["params"]["x"]
    else:
        data["correct_answers"]["y"] = 3 * data["params"]["x"]
```

??? example "Question with custom partial credit & feedback"

    === "Example `question.html`"

        ```html title="question.html"
        <pl-question-panel>
            If $x = {{params.x}}$ and $y$ is {{params.operation}} $x$, what is $y$?
        </pl-question-panel>

        <pl-number-input answers-name="y" label="$y =$"></pl-number-input>
        <pl-submission-panel> {{feedback.y}} </pl-submission-panel>
        ```

    === "Example `server.py`"

        ```python title="server.py"
        def generate(data):
            data["params"]["x"] = random.randint(5, 10)
            data["params"]["operation"] = random.choice(["double", "triple"])

            if data["params"]["operation"] == "double":
                data["correct_answers"]["y"] = 2 * data["params"]["x"]
            else:
                data["correct_answers"]["y"] = 3 * data["params"]["x"]

        def parse(data):
            if "y" not in data["format_errors"] and data["submitted_answers"]["y"] < 0:
                data["format_errors"]["y"] = "Negative numbers are not allowed"

        def grade(data):
            if math.isclose(data["score"], 0.0) and data["submitted_answers"]["y"] > data["params"]["x"]:
                data["partial_scores"]["y"]["score"] = 0.5
                data["score"] = 0.5
                data["feedback"]["y"] = "Your value for $y$ is larger than $x$, but incorrect."
        ```

### Elements

Questions can use **elements** to accept student input, display diagrams, control how questions are displayed. Elements are pre-built interface elements for common questions, like numerical inputs, multiple choice, and more. If you require more flexibility -- **custom elements** are reusable components that can be tailored to your course and provide a way to create more complex questions.

=== "Integer input element"

    ![](elements/pl-integer-input.png)

=== "HTML for element"

    ```html title="question.html"
    <pl-integer-input answers-name="int_value" label="$y =$"></pl-integer-input>
    ```

You can view a list of all the available elements in the [elements documentation](./elements.md).

### Assessments

A course contains a collection of questions, which are composed together to create [**assessments**](./assessment/index.md). Each course instance contains a collection of assessments. There are **exam assessments** and **homework assessments**.

Asssessments are organized into **assessment sets** based on the type of assessment (e.g. `Homework`, `Quiz`, `Exam`). Optionally, each assessment can be a part of a **module** (e.g. `Introduction`, `Review`, `Linked Lists`). Your assessments can then be shown to students grouped by module or by assessment set.

=== "Assessments (Module Grouping)"

    ![Assessments grouped by module](img/module-grouping.png)

=== "Assessments (Set Grouping)"

    ![Assessments grouped by set](img/set-grouping.png)

### JSON configuration files

Each item in PrairieLearn (questions, assessments, etc.) has associated metadata that describes the item. This metadata is stored in JSON files and describes the relationships between items, the item's properties, and other information. The metadata files are used to generate the user interface for editing and viewing the items, as well as the interface for students to complete the items.

| Item            | Metadata file             |
| --------------- | ------------------------- |
| Question        | `info.json`               |
| Course          | `infoCourse.json`         |
| Course Instance | `infoCourseInstance.json` |
| Assessment      | `infoAssessment.json`     |

## Next steps

Now that you have an understanding of the key concepts in PrairieLearn, you can learn more about how to [get started](./getStarted.md) with creating your course.

You can also:

- check out how to [develop locally](./installing.md)
- learn more about the workflow for [syncing content to PrairieLearn](./sync.md)
- learn more about [Course Instances](./courseInstance.md)
- learn more about [Questions](./question.md)
- learn more about [Assessments](./assessment/index.md)
- learn more about [Elements](./elements.md)
