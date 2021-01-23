# Java Autograder

This file documents the default Java autograder included in the `prairielearn/grader-java` Docker image.  For general information on how to set up an external grader, visit the [external grading](../externalGrading.md) page.

## Overview

The Java autograder is based on [JUnit 4](https://junit.org/junit4/). In essence, individual tests correspond to individual annotated methods that run testing code, such as ([source](https://github.com/junit-team/junit4/wiki/Getting-started)):

```java
import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class CalculatorTest {
  @Test
  public void evaluatesExpression() {
    Calculator calculator = new Calculator();
    int sum = calculator.evaluate("1+2+3");
    assertEquals(6, sum);
  }
}
```

The autograder combines several classes to allow these tests to happen:

* Student-provided class files. These are files submitted by the student (typically via `pl-file-upload` or `pl-file-editor` elements) containing the code to be tested.

* Test class files. These are provided by the question creator in the subdirectory `tests/junit` inside the question directory. There may be multiple test files, each with multiple test methods.

* Library files and instructor-provided classes. These again are provided by the instructor, and can be set up per question or per course, as described below.

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings.  To use the specific Java autograder detailed in this document, in the `"externalGradingOptions"` dictionary, `"image"` should be set to `"prairielearn/grader-java"` and `"entrypoint"` should point to `"java JUnitAutograder"`.

A full `info.json` file should look something like:

```javascript
{
    "uuid": "...",
    "title": "...",
    "topic": "...",
    "tags": [...],
    "type": "v3",
    "singleVariant": true,
    "gradingMethod": "External",
    "externalGradingOptions": {
        "enabled": true,
        "image": "prairielearn/grader-java",
        "timeout": 10,
        "entrypoint": "java JUnitAutograder",
    }
}
```

### `question.html`

As with other autograders, most questions using this autograder will contain a `pl-file-editor` or `pl-file-upload` element. The question should also include, in the `pl-submission-panel`, a `pl-external-grading-results` to show the status of grading jobs. It is also recommended to place a `pl-file-preview` element in the submission panel so that students may see their previous code submissions.  An example question markup is given below:

```html
<pl-question-panel>
  <pl-file-editor file-name="Example.java" ace-mode="ace/mode/java"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grading-results></pl-external-grading-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
```

### `tests/junit/*.java`

Inside the `tests/junit` directory, one or more classes can be provided with methods corresponding to JUnit tests. The autograder will compile each of the classes found in this directory, then run JUnit on these classes.

Tests that are part of a package must be provided in an equivalent subdirectory. For example, if a test named `AppTest` is in package `com.example.myapp.test`, it must be saved in the file `tests/junit/com/example/myapp/test/AppTest.java`.

By default, all tests will be named based on the method name for the corresponding test, and will be worth one point. To change this default, the `@AutograderInfo` must be added as shown below:

```java
import org.prairielearn.autograder.AutograderInfo;

/* ... */

    @Test
    @AutograderInfo(points=1, name="1. Test with input 1")
    public void testWithInputOne() {

        assertEquals(1, Example.square(1));
    }
```

Tests are listed to the user in alphabetical order of name.

### Libraries and instructor-provided classes

Instructors may provide additional libraries and classes as part of the Java classpath. By default, all `*.jar` files in the subdirectory `tests/libs` of the question will be included in the classpath, as well as the `tests/libs` directory itself. So, classes that need to be included in the compilation and runtime of the application should either be saved into a `*.jar` file and saved in the `tests/libs` directory, or compiled into a `*.class` file inside the same directory (with appropriate subdirectories if packages are used).

Some questions may include libraries and base classes that are common across multiple questions. For such questions, it is possible to save these libraries and classes in the course's `serverFilesCourse/java/libs` directory, using the same conventions as above. If this option is used, however, the question's `info.json` file should indicate that this directory should be added to the grading container, as below:

```javascript
    "externalGradingOptions": {
        "enabled": true,
        "image": "prairielearn/grader-java",
        "serverFilesCourse": ["java/libs/"],
        "timeout": 10,
        "entrypoint": "java JUnitAutograder",
    }
```
