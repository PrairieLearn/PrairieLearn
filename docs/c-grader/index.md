# C/C++ Autograder

This file documents the default C/C++ autograder included in the `prairielearn/grader-c` Docker image. For general information on how to set up an external grader, view the [external grading](../externalGrading.md) documentation.

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings. To use the specific C/C++ autograder detailed in this document, in the `"externalGradingOptions"` dictionary, `"image"` should be set to `"prairielearn/grader-c"`. The `"entrypoint"` does not need to be provided.

A full `info.json` file should look something like:

```json title="info.json"
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
    "image": "prairielearn/grader-c",
    "timeout": 10
  }
}
```

### `question.html`

Most questions using this autograder will contain a `pl-file-editor` or `pl-file-upload` element, though questions using other elements (e.g., `pl-string-input` for short expressions) are also possible. The question should also include, in the `pl-submission-panel`, a `pl-external-grader-results` to show the status of grading jobs. It is also recommended to place a `pl-file-preview` element in the submission panel so that students may see their previous code submissions. An example question markup is given below:

```html
<pl-question-panel>
  <pl-file-editor file-name="square.c" ace-mode="ace/mode/c_cpp"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grader-results></pl-external-grader-results>
  <pl-file-preview></pl-file-preview>
</pl-submission-panel>
```

### `tests/test.py`

The `test.py` file will contain the basic tests that must be executed by the C/C++ grader. A simple `test.py` to grade C code will look like this:

```python
#! /usr/bin/python3

import cgrader

class QuestionGrader(cgrader.CGrader):

    def tests(self):
        # Include tests here

g = QuestionGrader()
g.start()
```

A simple `test.py` to grade C++ code will look like this (the only difference is the parent class):

```python
#! /usr/bin/python3

import cgrader

class QuestionGrader(cgrader.CPPGrader):

    def tests(self):
        # Include tests here

g = QuestionGrader()
g.start()
```

The `tests` method above will contain the basis for user tests, and will have access to some regular functions provided by the C/C++ grader. Some methods that can be called are listed below.

Any file submitted using a `pl-file-editor` or `pl-file-upload`, or through workspaces, will be available for use by the C/C++ grader. To create tests based on parameters defined by `server.py`, or to have access to submitted data from other elements such as `pl-string-input` elements, you can access the `self.data` dictionary. This dictionary contains keys similar to those found in the `grade()` function in `server.py`, such as `self.data["params"]` or `self.data["submitted_answers"]`.

## Available test options

After compiling the student and instructor code, test may be created using one of two methods. The choice of method depends on the type of code students are expected to write, and the type of validation that need to be performed. The two main options are:

- Running the executable file compiled from student code, and [checking its output](#running-a-program-and-checking-its-standard-output). This option is recommended if students are expected to write open-ended complete programs that can be executed from the command line, and where the main purpose of the program is to generate some predetermined output based on the standard input, command line arguments, or external files.
- Running a [unit test suite based on the Check framework](#running-a-check-framework-test-suite). This option is strongly recommended for more complex cases, where students are expected to implement specific functions with well-defined behavior, and where multiple test cases and scenarios must be checked. This option is also recommended if you want to check for memory leaks and dangling pointers, which can be done using [the AddressSanitizer functionality](#identifying-dangling-pointers-memory-leaks-and-similar-issues).

### Compiling a C/C++ program

To compile a C or C++ file, you may use the method `self.compile_file()`. A typical call to this method, assuming students write a complete C file including the `main` function, will include two parameters: the name of the C or C++ file to be compiled (the file submitted by the student), and the name of an executable file to be created.

```python
self.compile_file("square.c", "square")      # Compile the file, but do not create a unit test result
self.test_compile_file("square.c", "square") # Compile the file and give one point to student if compilation is successful
```

By default, these methods use `gcc` and `g++` (for `CGrader` and `CPPGrader`, respectively) to compile the code. To use a different compiler (e.g., `clang`), set the `compiler` argument:

```python
self.compile_file("square.c", "square", compiler="clang")
```

By default, if the compilation fails, it will stop all tests and return the submission as ungradable. This means that the submission will not count towards the student's submission limit, and the student will not receive a grade. The student will, however, see the result of the compilation. If you would like the tests to proceed in case of failure, you can call the function with:

```python
self.compile_file("square.c", "square", ungradable_if_failed=False)
```

By default, if the compilation succeeds but gives a warning, a message with the warning will be listed in the main results message, above the test results. If you would not like the warnings to be listed at the top of the results, you can call the function with:

```python
self.compile_file("square.c", "square", add_warning_result_msg=False)
```

#### Setting compilation flags

You may also include additional compilation flags accepted by `gcc` (or `g++`) with the `flags` argument, which can be invoked with a single string for flags, or with an array of strings:

```python
self.compile_file("square.c", "square", flags="-Wall -O3") # single string
self.compile_file("square.c", "square", flags=["-Wall", "-O3"]) # array
```

For flags based on `pkg-config`, use `pkg_config_flags` with the library or libraries that should be queried.

```python
self.compile_file("square.c", "square", pkg_config_flags="check ncurses") # single string
self.compile_file("square.c", "square", pkg_config_flags=["check", "ncurses"]) # array
```

It is also possible to test programs where the student only submits part of an application. To compile the C/C++ file submitted by the user with some functions (including, for example, a `main` function) implemented by the instructor, you can save a `main.c` (or `main.cpp`) file inside the `tests` folder and run:

#### Working with multiple files

```python
self.compile_file("square.c", "square", add_c_file="/grade/tests/main.c")
```

The instruction above will compile the student-provided C/C++ file with the instructor-provided C/C++ file into the same executable.

If the student implements any function that is also implemented by the instructor's code, including `main` if provided, it will be ignored, and the instructor-provided functions will take precedence. This is achieved by compiling the code with the `-Wl,--allow-multiple-definition` flag of `gcc`. If, however, there is a need to make reference to some of these functions implemented by the student, the option `objcopy_args` can be used. If provided, the [`objcopy` command](https://man7.org/linux/man-pages/man1/objcopy.1.html) is called on the student's code with the specified list of arguments. This option only operates on student files, not on added (instructor-provided) files. For example, the following instruction compiles the same files above, but renames the student's `main` function into `student_main` and makes the static function `my_static_fn` global, so that the instructor's `main` function can call both of these functions directly.

```python
self.compile_file(
  "square.c",
  "square",
  add_c_file="/grade/tests/main.c",
  objcopy_args=["--redefine-sym", "main=student_main", "--globalize-symbol", "my_static_fn"],
)
```

It is also possible to compile multiple student files and multiple question-provided files into a single executable, by providing lists of files:

```python
self.compile_file(
    ["student_file1.c", "student_file2.c"],
    "executable",
    add_c_file=["/grade/tests/question_file1.c", "/grade/tests/question_file2.c"],
    flags=["-I/grade/tests", "-I/grade/student"],
)
```

If the compilation involves include (`.h`) files, the flags `-I/grade/tests` (for question-provided includes) and `-I/grade/student` (for student-provided includes) are recommended as well. The specific `.h` files don't need to be listed as arguments to `compile_file`.

If the executable name is not provided, then the files will be compiled only into equivalent object files (with `.o` extension). To link these files into an executable, the `link_object_files` can be used. This function receives three mandatory arguments: the student object files, the additional object files (which can be set to `None` if there are none), and the executable name. This separation allows for more fine-tuned compilation flags between different C files or between compilation and linking, as well as additional operations to be performed with the generated object files. For example, the following sequence compiles student files and instructor files with different flags.

```python
self.compile_file(["student_file1.c", "student_file2.c"],
                  flags=["-I/grade/tests", "-I/grade/student", "-Wall", "-g"])
self.compile_file([], # No student files in this invocation
                  add_c_file=["/grade/tests/question_file1.c",
                              "/grade/tests/question_file2.c"],
                  flags=["-I/grade/tests", "-I/grade/student"])
self.link_object_files(["student_file1.o", "student_file2.o"],
                       ["/grade/tests/question_file1.o", "/grade/tests/question_file2.o"],
                       "executable")
```

The `link_object_files` also accepts arguments like `flags`, `pkg_config_flags`, `add_warning_result_msg=False` and `ungradable_if_failed=False`, as described above.

#### Restricting the use of specific functions or global variables

For questions where students are not allowed to use a specific set of functions or global variables (e.g., students are not allowed to use the `system` library call), it is possible to reject a specific set of symbols. This option will cause an error similar to a compilation error if any of these symbols is referenced in the code. Only student files are checked against this list of symbols, so they can still be used in instructor code.

```python
self.compile_file(
    ["student_file1.c", "student_file2.c"],
    "executable",
    add_c_file=["/grade/tests/question_file1.c", "/grade/tests/question_file2.c"],
    flags=["-I/grade/tests", "-I/grade/student", "-lrt"],
    reject_symbols=["system", "vfork", "clone", "clone3", "posix_spawn", "posix_spawnp"],
)
```

#### Creating a test result for the compilation

To create a test result based on the compilation itself, use `self.test_compile_file()` instead of `self.compile_file()`. This method accepts the same arguments as `self.compile_file()`, but will create a test named "Compilation" worth one point by default.

```python
self.test_compile_file("square.c", "square") # Compile the file and give one point to student if compilation is successful
```

To change the name and/or points, set the `name` or `points` argument as follows:

```python
self.test_compile_file("square.c", "square", name="Compilation of the first file", points=3)
```

Note that you can set the `points` to zero if you want to create a test result for the compilation, but do not want to assign any points to it. This may be useful in combination with the `add_warning_result_msg=False` argument, which in this case will cause the warning to be shown in the test output instead of the main results message.

```python
self.test_compile_file("square.c", "square", points=0, add_warning_result_msg=False)
```

### Running a program and checking its standard output

The `self.test_run()` method can be used to run an executable and check its output. This will typically be the program generated by the compiler above, but it can be used for any program. The program will run [as a non-privileged user](#sandbox-execution).

The only required argument is the `command` argument, which corresponds to the command to be executed. If no additional parameters are set, the test will pass if the program completes within a certain time limit.

```python
self.test_run("./square")
```

#### Validating the output of the executed program

In most cases, though, this program will be executed to check the output of the program, which can be done by including the `exp_output` argument. In its simplest case, `exp_output` can be provided with a single string, and the test will pass if that string is found somewhere in the output of the program.

```python
self.test_run("./square", exp_output="SUCCESS")
```

The `exp_output` argument can also be used to check for multiple output patterns by passing in a list of strings. The test will then look for all the patterns in the program output, and the result of the test will depend on the `must_match_all_outputs` flag. This flag may be set to:

- `must_match_all_outputs="any"`: if any of the patterns is found in the program output, the test passes and full points are assigned (this is the default). The value `False` is also accepted for backwards compatibility.
- `must_match_all_outputs="all"`: all patterns must be found in the program output to pass the test. The value `True` is also accepted for backwards compatibility.
- `must_match_all_outputs="partial"`: the points assigned to the test are based on the number of patterns that are found in the program output (for example, if three patterns out of four are found, then the test is assigned 0.75 points).

```python
self.test_run("./square", exp_output=["SUCCESS", "CORRECT"]) # default, either SUCCESS or CORRECT are enough for full points
self.test_run("./square", exp_output=["TEST 1 PASSED", "TEST 2 PASSED"],
              must_match_all_outputs="partial") # Test passes with 0, 0.5 or 1, depending on if none, one or two patterns are found
```

Sometimes a test must ensure that some strings are _not_ found in the output of the program. This can be achieved with the `reject_output` argument, which again can be an array or a single string.

```python
self.test_run("diff -q output.txt expected.txt", reject_output=["differ"])
```

If you would like to highlight, in the test message or output, the expected and rejected outputs, you can use the `highlight_matches` argument. This option will highlight in green (for expected outputs) and red (for rejected outputs) all strings that matched in the program output.

```python
self.test_run("./square",
              exp_output=["TEST 1 PASSED", "TEST 2 PASSED"],
              reject_output=["ERROR", "FAIL"],
              must_match_all_outputs="all",
              highlight_matches=True)
```

By default, any sequence of space-like characters (space, line break, carriage return, tab) in the program output, expected output and rejected output strings will be treated as a single space for comparison. This means difference in the number and type of spacing will be ignored. So, for example, if the output prints two numbers as `1 \n 2`, while the expected output is `1 2`, the test will pass. If, however, the intention is that spaces must match a pattern exactly, the `ignore_consec_spaces` option can be set to `False`:

```python
self.test_run("./pattern", exp_output="  1  2  3\n  4  5  6\n  7  8  9",
              ignore_consec_spaces=False)
```

By default, differences in cases are ignored. To make all comparisons case-sensitive, set the `ignore_case` argument to `False`:

```python
self.test_run("./lowercase ABC", exp_output="abc", ignore_case=False)
```

For both `exp_output` and `reject_output`, regular expressions may be used, by providing a compiled pattern object from [Python's `re` module](https://docs.python.org/3/library/re.html#re.compile). Note: if a pattern object is used, arguments `ignore_consec_spaces` and `ignore_case` do not take effect. If these patterns should ignore consecutive spaces, a pattern such as `\\s+` may be used instead of spaces, while case may be ignored by using the [`re.I` flag](https://docs.python.org/3/library/re.html#re.I);

```python
self.test_run("./valid_date", exp_output=re.compile('([12]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))'))
```

#### Providing input to the executed program

This method can also be provided with an input string to be passed to the standard input of the program, with the `input` argument:

```python
self.test_run("./square", input="3\n", exp_output="9")
```

To use command-line arguments for a command, the arguments can be included either in the `command` itself, or with the `args` argument, which can be a single argument set as a string, or multiple arguments in a list:

```python
self.test_run("./square 3 5", exp_output=["9", "25"],
              must_match_all_outputs="all")
self.test_run("./square", args="3", exp_output="9")
self.test_run("./square", args=["3", "5"], exp_output=["9", "25"],
              must_match_all_outputs="all")
```

#### Limiting the execution time and output size

To avoid issues with student-provided code running longer than expected, such as in cases of infinite loop, the program will time out after one second. In this case, the test will be considered failed. This setting can be changed with the `timeout` argument, which should be set to a number of seconds.

```python
self.test_run("./slowprogram", exp_output="COMPLETED", timeout=10)
```

To avoid issues with student-provided code producing code that is too large for PrairieLearn to handle, by default any program with more than 10 KB (more precisely, 10240 characters) of output will fail and have its output truncated. To change this limit, use the `size_limit` argument, which should be set to a number of characters.

```python
self.test_run("./verboseprogram", exp_output="COMPLETED", size_limit=102400)
```

#### Setting a custom test name, message and points

The test will be created and shown to the user, worth 1 point by default. The default name for a test that includes an `input` argument is: `Test with input "<INPUT>"` (where `INPUT` is the provided input). For a test that uses `args`, the default name is `Test with arguments "<ARGS>"` (where `ARGS` is the set of arguments separated by spaces). A message will also be included with a summary of expected and rejected outputs. To change these settings, use the `max_points`, `msg` and/or `name` arguments:

```python
self.test_run("diff -q output.txt expected.txt", reject_output=["differ"],
              name="Comparing final output", max_points=3,
              msg="Output file should match expected file.")
```

### Running a Check framework test suite

For tests that involve more complex scenarios, particularly related to individual function calls and unit tests, the C autograder allows integration with a modified version of the [Check framework](https://libcheck.github.io/check/). This framework provides functionality to run multiple test suites and test cases with individual unit tests. It is also able to capture signals (e.g., segmentation fault) by running unit tests in an isolated process.

To run a Check suite, create a main C file in the `tests` directory, containing the tests and a `main` function that runs the Check suite. This C file may look like:

```c title="main.c"
#include <check.h>

extern int factorial(int x);

START_TEST(test_factorial) {
    ck_assert_int_eq(factorial(0), 1);
    ck_assert_int_eq(factorial(1), 1);
    ck_assert_int_eq(factorial(2), 2);
    ck_assert_int_eq(factorial(5), 120);
    ck_assert_int_eq(factorial(10), 3628800);
}
END_TEST

int main(void) {
    Suite *s = suite_create("factorial");

    TCase *tc_factorial = tcase_create("Check factorial return value");
    tcase_add_test(tc_factorial, test_factorial);
    suite_add_tcase(s, tc_factorial);

    SRunner *sr = srunner_create(s);
    srunner_run_all(sr, CK_NORMAL);
    srunner_free(sr);
    return 0;
}
```

A tutorial with instructions on how to create test suites, test cases and unit tests can be found in [the official Check documentation](https://libcheck.github.io/check/doc/check_html/check_3.html#Tutorial). The example course also includes [basic questions](https://github.com/PrairieLearn/PrairieLearn/tree/master/exampleCourse/questions/demo/autograder/c) that can be used as a starting point.

!!! note

    Note that the functionality for working with the Check framework relies on its [test logging features](https://libcheck.github.io/check/doc/check_html/check_4.html#Test-Logging). To ensure the tests are properly captured by the autograder you should not overwrite the log files.

A typical `test.py` file for a Check-based suite will look something like this, assuming `student_code.c` contains the student code and `/grade/tests/main.c` contains the Check tests like the example above:

```python title="test.py"
import cgrader

class DemoGrader(cgrader.CGrader):
    def tests(self):
        self.compile_file("student_code.c", "main", add_c_file="/grade/tests/main.c",
                          # The following must be included if compiling a Check test
                          pkg_config_flags="check")
        self.run_check_suite("./main")

g = DemoGrader()
g.start()
```

To compile the student code and test suite, use the `self.compile_file()` or `self.test_compile_file()` described above. Make sure that the `pkg_config_flags` argument includes the `check` library for proper compilation.

The `self.run_check_suite()` method will call the executable containing the Check test suites, will parse the log files, and will create one autograder test for each unit test executed by the Check suites. One test result will be created for each unit test within each test case, so you may create as many test cases and as many unit tests as you wish to provide further details to students. The name of the test will typically be the name of the Check test case followed by the unit test ID, though this can be changed by setting the following arguments to `True` or `False`:

- `use_suite_title`: use the title of the test suite in the test name (default: false);
- `use_case_name`: use the name of the test case in the test name (default: true);
- `use_unit_test_id`: use the ID of the unit test in the test name (default: true);
- `use_iteration`: for tests executed in a loop, include the iteration number in the test name (default: false).

```python
self.run_check_suite("./main", use_suite_title=True, use_unit_test_id=False)
```

The version of Check used in the autograder has been modified slightly to include additional safeguards against malicious student code. These safeguards restrict access to test logs and other resources to the processes running unit tests. To ensure these safeguards work as expected, your test application:

- should keep Check's default fork status enabled, i.e., do not set "No Fork Mode";
- should open any files or file-like resources in the unit test itself or in checked fixtures, i.e., do not open files in unchecked fixtures or in the main application;
- should not rely on environment variables for any student application, or set them manually in the unit test itself or in checked fixtures.

If your application explicitly needs to keep any of the restricted environments above, you may disable some of these safeguards in your code. _Note that disabling these safeguards increases the chances that a student may bypass your unit tests and autograder_, so only do this if absolutely necessary. You may do this by setting the following preprocessor directives _at the top of your test code_ (before `#include <check.h>`):

```c
// Use this directive to retain file descriptors opened by the test application or unchecked fixtures
#define PLCHECK_KEEP_FD

// Use this directive to run the unit test applications as root
#define PLCHECK_KEEP_UID

// Use this directive to retain environment variables
#define PLCHECK_KEEP_ENV

// Use this directive to have the unit test process remain a direct child of the test application
#define PLCHECK_NO_EXTRA_FORK
```

### Identifying dangling pointers, memory leaks and similar issues

A major concern when testing C/C++ code is to identify cases of dangling pointers and memory leaks. The [AddressSanitizer](https://github.com/google/sanitizers/wiki/AddressSanitizer) library can be used for this purpose in this autograder. In particular, it is able to detect: use-after-free and use-after-return; out-of-bounds access in heap, stack and global arrays; and memory leaks.

To add this library to the code, add the following option to the compilation function (`compile_file`, `test_compile_file` or `link_object_files`):

```python
self.compile_file(..., enable_asan=True)
```

By default, the options above will compile the code with flags that will cause the application to abort immediately when an invalid memory access is identified, or before exiting in case of memory leaks. If you are using the autograder workflow that checks the program's standard output, this functionality should capture the majority of cases, though you may want to include some reject strings that capture memory leaks. For example:

```python
self.test_run(..., reject_output=['AddressSanitizer'])
```

If you are using the check-based workflow, note that while the setup above will cause the tests to fail in these scenarios, it may not provide a useful message to students. To provide a more detailed feedback to students in this case, you are strongly encouraged to add a call to `pl_setup_asan_hooks()` at the start of your main function, like this:

```c
int main(int argc, char *argv[]) {

  pl_setup_asan_hooks();
  Suite *s = suite_create(...);
  // ...
}
```

If you need more fine-tuned control over when and where these memory access problems happen, you can use the ASAN interface to provide further control. For example, if you want to identify the status of individual pointers to check if they have been correctly allocated, you can use `__asan_address_is_poisoned` or `__asan_region_is_poisoned`:

```c
  ck_assert_msg(__asan_address_is_poisoned(deleted_node), "Deleted node has not been freed");
  ck_assert_msg(!__asan_address_is_poisoned(other_node), "Node other than the first element has been freed");
  ck_assert_msg(!__asan_region_is_poisoned(new_node, sizeof(struct node)), "Node was not allocated with appropriate size");
```

It is also possible to [set specific flags](https://github.com/google/sanitizers/wiki/AddressSanitizerFlags) to change the behavior of AddressSanitizer, by setting the environment variable `ASAN_OPTIONS` when calling `run_check_suite`. For example, to disable the memory leak check, you may use:

```python
self.run_check_suite("./main", env={"ASAN_OPTIONS": "detect_leaks=0"})
```

### Running a command without creating a test

It is also possible to run a command that is not directly linked to a specific test. This can be done with the `self.run_command()` method, which at the minimum receives a command as argument. This command can be a single string with or without arguments, or an array of strings containing the executable as the first element, and the arguments to follow. The method returns a string containing the standard output (and standard error) generated by the program.

```python
files = self.run_command("ls -alR /grade")
files = self.run_command(["ls", "-alR", "/grade"])
```

The command by default will run as a [sandboxed user](#sandbox-execution). If you need to run the command as the container's `root` (the same user running the test script itself) you may set the argument `sandboxed` to `False` (not recommended for any program provided by a student):

```python
result = self.run_command("rm -rf testfile.txt", sandboxed=False)
```

To provide a string to be used as standard input for the program, use the `input` argument:

```python
result = self.run_command("./square", input="3\n")
```

To ensure the program does not run forever, you may set a `timeout` option, which provides a timeout in seconds. If the program doesn't complete within this timeout, the method will return a standard timeout message. It is highly recommended that student-provided code run with a timeout setting.

```python
result = self.run_command("./square", timeout=1)
```

If the program requires specific environment variables, you may set the `env` argument. This argument must be provided as a key-value `dict`.

```python
result = self.run_command("./square", env={"TEMP_FILE": "/tmp/my_temp.dat"})
```

### Manually adding test results

Methods like `self.test_compile_file()` and `self.test_run()` will create a new test result that will be presented to the user. It is also possible to create your own tests based on separate computations, with the `self.add_test_result()` method. The simplest invocation of this method is with only the test name, which will create a passing test worth one point, with no message, no output and no description.

```python
self.add_test_result("Bonus point for submitting something!")
```

You may also optionally add a description, message and output to the test:

```python
self.add_test_result("Bonus point for submitting something!",
                     description="This is for all my students, thank you for submitting.",
                     msg="Nothing to be expected.",
                     output=submitted_answer)
```

To set the number of points the test is worth, and/or its maximum number of points, use the `points` and `max_points` arguments. The `max_points` value must be a number (integer or float), and defaults to `1` if not provided. The `points` argument can be a number, in which case it is based on the maximum number of points; or you may set `points` to a boolean-like expression, in which case `points` will be set to 0 if the expression is `False`, and to `max_points` if the expression is `True`.

```python
self.add_test_result("I am lazy, everyone gets 70%",
                     points=70, max_points=100)
```

This method also allows you to add one or more images to the result. Images must follow the format described in the [external grading](../externalGrading.md) documentation.

```python
self.add_test_result("Generated image", points=matched_pixels,
                     max_points=total_pixels,
                     images=[{"label": "Your image", "url": dataURI},
                             {"label": "Expected image", "url": expectedURI})
```

### Code subject to manual review

In some situations, instructors may perform a manual review of the student's code, to check for issues like code style, comments, use of algorithms and other criteria that can't easily be programmed into code. This can be done by setting both [auto points and manual points](../assessment/configuration.md#assessment-points) to the assessment question. The grade generated by the external grader only affects the auto points, leaving the manual points free to be used by the course staff as they see fit.

## Sandbox execution

The autograder is set up to allow programs to run either as root or as a non-privileged user. This feature is available to ensure that the student is unable to manipulate the testing environment or manually modify their grade in the container.

By default, the sandbox user will not have access to any files inside the `/grade` folder in the container. If it is expected that a program running in this environment have access to a specific file, access must be explicitly granted to the user. This can be done with the `change_mode()` method, which receives two arguments: the file name/path, and the mode to be set.

```python
self.change_mode("/grade/student/myfile.txt", "744")
```

Any program compiled with `test_compile_file()` will be granted executable permissions (mode `755`), so these programs don't need to be explicitly allowed by your tests.

As is typical in Unix-like systems, creating new files requires write permission in the directory where the file is created. Therefore, if a program is expected to create new files in a specific directory, write permission must be granted to that directory as well. You should avoid granting write permissions to system directories, such as `/grade` or `/grade/tests`, as students may be able to bypass the sandbox environment otherwise. Instead, create specific subdirectories for student files, and grant write permission to those directories only. You may want to switch the current working directory to that directory as well, which can be done with the `os.chdir()` method.

```python
self.run_command("mkdir -p /tmp/sbdir", sandboxed=False)
self.change_mode("/tmp/sbdir", "777")
os.chdir("/tmp/sbdir")
```

Note that changing the working directory also affects how student programs are invoked. This typically means that any execution of a student program must replace the typical `./` prefix with the directory where the student file was originally compiled, which by default is `/grade/student/`. For example, if the compilation process was executed before the statements above, the following command must be used to run a student program named `myprog`:

```python
self.test_run("/grade/student/myprog", ...)
```

The use of the `tempfile` library is also recommended to create temporary files and directories that the student code may use. Note that any file or directory created with this library will not be accessible to the sandbox user by default, so you must explicitly change its mode as shown above.
