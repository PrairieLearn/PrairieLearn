# Java Autograder

This file documents the default Java autograder included in the `prairielearn/grader-java` Docker image. For general information on how to set up an external grader, visit the [external grading](../externalGrading.md) page.

## Overview

The Java autograder is based on [JUnit 5](https://junit.org/junit5/). In essence, individual tests correspond to individual annotated methods that run testing code, such as ([source](https://junit.org/junit5/docs/current/user-guide/#writing-tests)):

```java
import static org.junit.jupiter.api.Assertions.assertEquals;

import example.util.Calculator;

import org.junit.jupiter.api.Test;

class MyFirstJUnitJupiterTests {

    private final Calculator calculator = new Calculator();

    @Test
    void addition() {
        assertEquals(2, calculator.add(1, 1));
    }

}
```

The autograder combines several classes to allow these tests to happen:

- Student-provided class files. These are files submitted by the student (typically via `pl-file-upload` or `pl-file-editor` elements) containing the code to be tested.

- Test class files. These are provided by the question creator in the subdirectory `tests/junit` inside the question directory. There may be multiple test files, each with multiple test methods.

- Library files and instructor-provided classes. These again are provided by the instructor, and can be set up per question or per course, as described below.

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings. To use the specific Java autograder detailed in this document, in the `"externalGradingOptions"` dictionary, `"image"` should be set to `"prairielearn/grader-java"` and `"entrypoint"` should point to `"autograder.sh"`.

A full `info.json` file should look something like:

```json
{
  "uuid": "...",
  "title": "...",
  "topic": "...",
  "tags": ["..."],
  "type": "v3",
  "singleVariant": true,
  "gradingMethod": "External",
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-java",
    "timeout": 10,
    "entrypoint": "autograder.sh"
  }
}
```

### `question.html`

As with other autograders, most questions using this autograder will contain a `pl-file-editor` or `pl-file-upload` element. The question should also include, in the `pl-submission-panel`, a `pl-external-grader-results` to show the status of grading jobs. It is also recommended to place a `pl-file-preview` element in the submission panel so that students may see their previous code submissions. An example question markup is given below:

```html
<pl-question-panel>
  <pl-file-editor file-name="Example.java" ace-mode="ace/mode/java"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results></pl-external-grader-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
```

### `tests/junit/*.java`

Inside the `tests/junit` directory, one or more classes can be provided with methods corresponding to JUnit tests. The autograder will compile each of the classes found in this directory, then run JUnit on these classes.

Tests that are part of a package must be provided in an equivalent subdirectory. For example, if a test named `AppTest` is in package `com.example.myapp.test`, it must be saved in the file `tests/junit/com/example/myapp/test/AppTest.java`.

Each test found by JUnit will be provided as an individual result to the student. The name of the test result is based on the test's [display name](https://junit.org/junit5/docs/current/user-guide/#writing-tests-display-names). By default, each test will be worth one point. To change this default, a [tag](https://junit.org/junit5/docs/current/user-guide/#writing-tests-tagging-and-filtering) in the format `@Tag("points=XX")` (replacing `XX` with a number of points) must be provided. For example:

```java
    @Test
    @DisplayName("Test addition of values 1 and 1")
    @Tag("points=5")
    void addition() {
        assertEquals(2, calculator.add(1, 1));
    }
```

An alternative method to specify points and display name is to use the custom `@AutograderInfo` annotation as shown below. This is recommended for legacy JUnit 4 tests, which provide limited support for tags.

```java
import org.prairielearn.autograder.AutograderInfo;

/* ... */

    @Test
    @AutograderInfo(points=1, name="1. Test with input 1")
    public void testWithInputOne() {

        assertEquals(1, Example.square(1));
    }
```

To change the order in which test results are shown to the user, you may use [the `@TestMethodOrder` annotation](https://junit.org/junit5/docs/current/user-guide/#writing-tests-test-execution-order).

To produce output that will be visible to students, tests may be optionally declared with [an argument of type `TestReporter`](https://junit.org/junit5/docs/current/user-guide/#writing-tests-dependency-injection). Calling [the `publishEntry` method for the test reporter](https://junit.org/junit5/docs/current/api/org.junit.jupiter.api/org/junit/jupiter/api/TestReporter.html) will cause the provided entry to be printed as the output of the test. For example:

```java
@Test
@DisplayName("Test addition of values 1 and 1")
void addition(TestReporter reporter) {
    // Produce a single line of output
    reporter.publishEntry("Calculating the addition of 1 and 1, which should result in 2");
    // Alternatively, multiple key-value entries may be provided instead
    reporter.publishEntry("TEST", "Adding 1 plus 1");
    reporter.publishEntry("EXPECTED", "2");
    reporter.publishEntry("RESULT", calculator.add(1, 1).toString());
    assertEquals(2, calculator.add(1, 1));
}
```

The autograder will give a question points based on if a test passed or failed based on the default Java behaviour. Note that [Java's built-in assertions](https://docs.oracle.com/javase/7/docs/technotes/guides/language/assert.html) are disabled by default, and as such tests that rely on Java's `assert` keyword may not work as intended. If test failures based on `assert` statements are needed, the program must be set up to be compiled with the `-ea` option, [as listed below](#changing-compilation-options). An alternative is to use the `assertTrue` method in JUnit itself, with the benefit of providing more flexibility on the error message shown to students.

### Dynamic, parameterized and repeated tests

JUnit 5 supports tests that are generated dynamically. These include [parameterized tests](https://junit.org/junit5/docs/current/user-guide/#writing-tests-parameterized-tests), [repeated tests](https://junit.org/junit5/docs/current/user-guide/#writing-tests-repeated-tests) and [test factories](https://junit.org/junit5/docs/current/user-guide/#writing-tests-dynamic-tests).

While the autograder supports the execution of these types of tests, they may in rare instances cause inconsistencies in the total number of points assigned to each submission. In particular, if different submissions generate different sets of tests, the total number of tests assigned to one student (and consequentially the maximum number of points) may be different than other students, causing the score percentage to be inconsistent. Also, if the student's code causes the autograder to crash (e.g., in case of out-of-memory errors or thread exhaustion), some tests may not be registered on time to be considered in the grading process.

To avoid these issues, if a particular test class includes any dynamic test (i.e., tests using annotations like `@ParameterizedTest`, `@RepeatedTest` or `@TestFactory`), instructors are encouraged to define the maximum number of expected points as a class annotation, as demonstrated below. Classes that only use regular method tests (i.e., tests using annotations like `@Test`) are not required to use such a tag, as the total number of points can be easily retrieved from the static tests themselves at the start of the testing process.

```java
@Tag("maxpoints=16")
public class ExampleJUnit5Test {

    @ParameterizedTest(name = "Test with input {0}")
    @ValueSource(ints = {0, 1, 2, 4, 10, -1, -10, -100})
    @Tag("points=2")
    public void testWithInput(int i) {
        // ...
    }
}
```

### Changing compilation options

By default the Java compiler will show all compilation warnings to the user, except for `serial` (missing `serialVersionUID` on serializable classes). If you would like to change the compilation warnings or other compilation settings, you may do so by setting the `JDK_JAVAC_OPTIONS` environment variable in `info.json`, as follows:

```json
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-java",
    "timeout": 10,
    "entrypoint": "autograder.sh",
    "environment": { "JDK_JAVAC_OPTIONS": "-Xlint:-static -Xmaxerrs 3" }
  }
}
```

The example above disables the `static` warning (use of static fields applied to object expressions) and limits the number of errors to 3. A more comprehensive list of options can be found in the [`javac` documentation page](https://docs.oracle.com/en/java/javase/11/tools/javac.html). Some options of interest may include:

- `-Xlint:none` or `-nowarn` to disable all warnings;
- `-Xdoclint` to enable warnings for javadoc comments;
- `-source 10` to compile using the Java 10 language version;
- `-ea` to enable [Java assertions](https://docs.oracle.com/javase/7/docs/technotes/guides/language/assert.html).

### Libraries and instructor-provided classes

Instructors may provide additional libraries and classes as part of the Java classpath. By default, all `*.jar` files in the subdirectory `tests/libs` of the question will be included in the classpath, as well as the `tests/libs` directory itself. So, classes that need to be included in the compilation and runtime of the application should either be saved into a `*.jar` file and saved in the `tests/libs` directory, or compiled into a `*.class` file inside the same directory (with appropriate subdirectories if packages are used).

Some questions may include libraries and base classes that are common across multiple questions. For such questions, it is possible to save these libraries and classes in the course's `serverFilesCourse/java/libs` directory, using the same conventions as above. If this option is used, however, the question's `info.json` file should indicate that this directory should be added to the grading container, as below:

```json
{
  "externalGradingOptions": {
    "enabled": true,
    "image": "prairielearn/grader-java",
    "serverFilesCourse": ["java/libs/"],
    "timeout": 10,
    "entrypoint": "autograder.sh"
  }
}
```

The libraries required to run JUnit 5 tests are already included as part of the autograder container, and don't need to be included again.

## Technical details

### Sandbox environment and access to files

The JUnit tests, as well as the student code, are executed in a sandboxed environment as a non-root user. The code has the ability to create, modify or delete any files within the sandbox user's home directory (`/home/sbuser`), but cannot access most other directories in the environment. This is set up to deter students from creating code that manipulates the autograder or the grading results, since these can only be updated by the autograder script.

The user directory is initially empty. Any files and directories that are required for testing must be created by the JUnit test class itself.

The [instructor provided library files](index.md#libraries-and-instructor-provided-classes) are copied to the testing environment as they are to a directory called `/grade/classpath`. To ensure they can be used in the Java library, this directory and its contents are readable by the sandbox user. Instructors are warned that any file that should not be viewed by the student (e.g., the source code of test files or some libraries) should not be included in the question's `tests/libs` directory or in the course's `serverFilesCourse/java/libs` directory, as such files could be visible by a well-crafted malicious student submission.
