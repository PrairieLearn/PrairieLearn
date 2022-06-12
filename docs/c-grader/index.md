# C/C++ Autograder

This file documents the default C/C++ autograder included in the `prairielearn/grader-c` Docker image. For general information on how to set up an external grader, visit the [external grading](../externalGrading.md) page.

## Setting up

### `info.json`

The question should be first set up to enable [external grading](../externalGrading.md), with `"gradingMethod": "External"` set in the `info.json` settings. To use the specific C/C++ autograder detailed in this document, in the `"externalGradingOptions"` dictionary, `"image"` should be set to `"prairielearn/grader-c"` and `"entrypoint"` should point to a test file in the question, which will then invoke the autograder.

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
        "image": "prairielearn/grader-c",
        "timeout": 100,
        "entrypoint": "python3 /grade/tests/test.py",
    }
}
```

Note that the `entrypoint` setting includes a call to `python3` before the test file. This is recommended for cases where the `test.py` file is not properly set as executable in the Git repository.

### `question.html`

Most questions using this autograder will contain a `pl-file-editor` or `pl-file-upload` element, though questions using other elements (e.g., `pl-string-input` for short expressions) are also possible. The question should also include, in the `pl-submission-panel`, a `pl-external-grading-results` to show the status of grading jobs. It is also recommended to place a `pl-file-preview` element in the submission panel so that students may see their previous code submissions. An example question markup is given below:

```html
<pl-question-panel>
  <pl-file-editor file-name="square.c" ace-mode="ace/mode/c_cpp"></pl-file-editor>
</pl-question-panel>

<pl-submission-panel>
  <pl-external-grading-results></pl-external-grading-results>
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

Any file submitted using a `pl-file-editor` or `pl-file-upload` will be available for use by the C/C++ grader. To create tests based on parameters defined by `server.py`, or to have access to submitted data from other elements such as `pl-string-input` elements, you can access the `self.data` dictionary. This dictionary contains the similar keys to those found in the `grade()` function in `server.py`, such as `self.data["params"]` or `self.data["submitted_answers"]`.

## Available test options

### Compiling a C/C++ program

To compile a C or C++ file, you may use the methods `self.compile_file()` or `self.test_compile_file()`. Both methods provide similar functionality, with the difference being that `self.test_compile_file()` will also include a unit test for the compilation itself. The latter can be used to provide points to a submission based on a successful compilation.

A simple invocation of these methods, assuming students write a complete C file including the `main` function, will include two parameters: the name of the C or C++ file to be compiled (typically the same name used in the `pl-file-upload` or `pl-file-editor` elements listed above), and the name of an executable file to be created.

```python
self.compile_file('square.c', 'square')      # Compile the file, but do not create a unit test result
self.test_compile_file('square.c', 'square') # Compile the file and give one point to student if compilation is successful
```

By default, if the compilation fails, it will stop all tests and return the submission as ungradable. This means that the submission will not count towards the student's submission limit, and the student will not receive a grade. The student will, however, see the result of the compilation. If you would like the tests to proceed in case of failure, you can call the function with:

```python
self.compile_file('square.c', 'square', ungradable_if_failed=False)
self.test_compile_file('square.c', 'square', ungradable_if_failed=False)
```

By default, if the compilation succeeds but gives a warning, a message with the warning will be listed in the main results message, above the test results. If you would not like the warnings to be listed at the top of the results, you can call the function with:

```python
self.compile_file('square.c', 'square', add_warning_result_msg=False)      # Does not show any warnings
self.test_compile_file('square.c', 'square', add_warning_result_msg=False) # Creates a test result that includes the warning as the output
```

You may also include additional compilation flags accepted by `gcc` (or `g++`) with the `flags` argument, which can be invoked with a single string for flags, or with an array of strings:

```python
self.compile_file('square.c', 'square', flags='-Wall -O3') # single string
self.compile_file('square.c', 'square', flags=['-Wall', '-O3']) # array
```

For flags based on `pkg-config`, use `pkg_config_flags` with the library or libraries that should be queried.

```python
self.compile_file('square.c', 'square', pkg_config_flags='check ncurses') # single string
self.compile_file('square.c', 'square', pkg_config_flags=['check', 'ncurses']) # array
```

It is also possible to test programs where the student only submits part of an application. To compile the C/C++ file submitted by the user with a `main` function implemented by the instructor, you can save a `main.c` (or `main.cpp`) file inside the `tests` folder and run:

```python
self.compile_file('square.c', 'square', add_c_file='/grade/tests/main.c')
```

The instruction above will compile the student-provided C/C++ file with the instructor-provided C/C++ file into the same executable. If the student provides a `main` function, it will be ignored, and the instructor-provided main file will take precedence.

In some situations you may want to include or replace other functions besides `main`. You may do that by placing these functions in a `.c` or `.cpp` file inside the `tests` folder and run:

```python
self.compile_file('square.c', 'square', add_c_file='/grade/tests/otherfunctions.c')
```

It is also possible to compile multiple student files and multiple question-provided files into a single executable, by providing lists of files:

```python
self.compile_file(['student_file1.c', 'student_file2.c'], 'executable',
                  add_c_file=['/grade/tests/question_file1.c',
                              '/grade/tests/question_file2.c'],
                  flags=['-I/grade/tests', '-I/grade/student'])
```

If the compilation involves include (`.h`) files, the flags `-I/grade/tests` (for question-provided includes) and `-I/grade/student` (for student-provided includes) are recommended as well. The specific `.h` files don't need to be listed as arguments to `compile_file`.

For `self.test_compile_file()`, the results of the compilation will show up as a test named "Compilation", worth one point. To change the name and/or points, set the `name` or `points` argument as follows:

```python
self.test_compile_file('square.c', 'square', name='Compilation of the first file', points=3)
```

### Running a program and checking its standard output

The `self.test_run()` method can be used to run an executable and check its output. This will typically be the program generated by the compiler above, but it can be used for any program. The program will run [as a non-privileged user](#sandbox-execution).

The only required argument is the `command` argument, which corresponds to the command to be executed:

```python
self.test_run('./square')
```

In most cases, though, this program will be executed to check the output of the program, which can be done by including the `exp_output` argument. In its simplest case, `exp_output` can be provided with a single string, and the test will pass if that string is found somewhere in the output of the program.

```python
self.test_run('./square', exp_output='SUCCESS')
```

The `exp_output` argument can also be used to check for multiple outputs by passing in a list of outputs. In that case, the test will pass if any of the strings in the list is found in the output.

```python
self.test_run('./square', exp_output=['SUCCESS', 'CORRECT'])
```

Alternatively, if multiple output strings should be checked and all of them must be in the output of the program, you may use the `must_match_all_outputs` flag:

```python
self.test_run('./square', exp_output=['TEST 1 PASSED', 'TEST 2 PASSED'],
              must_match_all_outputs=True)
```

This method can also be provided with an input string to be passed to the standard input of the program, with the `input` argument:

```python
self.test_run('./square', input='3\n', exp_output='9')
self.test_run('./square', '3\n', '9') # input and exp_output can also be passed
                                      # as positional arguments
```

To use command-line arguments for a command, the arguments can be included either in the `command` itself, or with the `args` argument, which can be a single argument set as a string, or multiple arguments in a list:

```python
self.test_run('./square 3 5', exp_output=['9', '25'],
              must_match_all_outputs=True)
self.test_run('./square', args='3', exp_output='9')
self.test_run('./square', args=['3', '5'], exp_output=['9', '25'],
              must_match_all_outputs=True)
```

Some times a test must ensure that some strings are _not_ found in the output of the program. This can be achieved with the `reject_output` argument, which again can be an array or a single string.

```python
self.test_run('diff -q output.txt expected.txt', reject_output=['differ'])
```

By default, any sequence of space-like characters (space, line break, carriage return, tab) in the program output, expected output and rejected output strings will be treated as a single space for comparison. This means difference in the number and type of spacing will be ignored. So, for example, if the output prints two numbers as `1 \n 2`, while the expected output is `1 2`, the test will pass. If, however, the intention is that spaces must match a pattern exactly, the `ignore_consec_spaces` option can be set to `False`:

```python
self.test_run('./pattern', exp_output='  1  2  3\n  4  5  6\n  7  8  9',
              ignore_consec_spaces=False)
```

By default, differences in cases are ignored. To make all comparisons case-sensitive, set the `ignore_case` argument to `False`:

```python
self.test_run('./lowercase', 'ABC', 'abc', ignore_case=False)
```

To avoid issues with student-provided code running longer than expected, such as in cases of infinite loop, the program will timeout after one second. In this case, the test will be considered failed. This setting can be changed with the `timeout` argument, which should be set to a number of seconds.

```python
self.test_run('./slowprogram', exp_output='COMPLETED', timeout=10)
```

To avoid issues with student-provided code producing code that is too large for PrairieLearn to handle, by default any program with more than 10KB (more precisely, 10240 characters) of output will fail and have its output truncated. To change this limit, use the `size_limit` argument, which should be set to a number of characters.

```python
self.test_run('./verboseprogram', exp_output='COMPLETED', size_limit=102400)
```

The test will be created and shown to the user, worth 1 point by default. The default name for a test that include an `input` argument is: `Test with input "<INPUT>"` (where `INPUT` is the provided input). For a test that uses `args`, the default name is `Test with arguments "<ARGS>"` (where `ARGS` is the set of arguments separated by spaces). A message will also be included with a summary of expected and rejected outputs. To change these settings, use the `max_points`, `msg` and/or `name` arguments:

```python
self.test_run('diff -q output.txt expected.txt', reject_output=['differ'],
              name='Comparing final output', max_points=3,
              msg='Output file should match expected file.')
```

### Running a Check framework test suite

For tests that involve more complex scenarios, particularly related to individual function calls and unit tests, the C autograder allows integration with the [Check framework](https://libcheck.github.io/check/). This framework provides functionality to run multiple test suites and test cases with individual unit tests. It is also able to capture signals (e.g., segmentation fault) by running unit tests in an isolated process.

To run a Check suite, create a main C file containing the tests and a `main` function that runs the Check suite. A tutorial with instructions on how to create test suites, test cases and unit tests can be found in [the official Check tutorial](https://libcheck.github.io/check/doc/check_html/check_3.html#Tutorial). The example course also includes a basic test suite that can be used as an example.

Note that the functionality for working with the Check framework relies on its [test logging features](https://libcheck.github.io/check/doc/check_html/check_4.html#Test-Logging). To ensure the tests are properly captured by the autograder you should not overwrite the log files.

A typical `test.py` file for a Check-based suite will look something like this, assuming `student_code.c` contains the student code and `/grade/tests/main.c` contains the Check tests:

```python
import cgrader

class DemoGrader(cgrader.CGrader):

    def tests(self):

        self.compile_file('student_code.c', 'main', add_c_file='/grade/tests/main.c',
                          # The following must be included if compiling a Check test
                          pkg_config_flags='check')
        self.run_check_suite('./main')

g = DemoGrader()
g.start()
```

To compile the student code and test suite, use the `self.compile_file()` or `self.test_compile_file()` described above. Make sure that the `pkg_config_flags` argument includes the `check` library for proper compilation.

The `self.run_check_suite()` method will call the executable containing the Check test suites, will parse the log files, and will create one autograder test for each unit test executed by the Check suites. The name of the test will typically be the name of the Check test case followed by the unit test ID, though this can be changed by setting the following arguments to `True` or `False`:

- `use_suite_title`: use the title of the test suite in the test name (default: false);
- `use_case_name`: use the name of the test case in the test name (default: true);
- `use_unit_test_id`: use the ID of the unit test in the test name (default: true);
- `use_iteration`: for tests executed in a loop, include the iteration number in the test name (default: false).

```python
self.run_check_suite('./main', use_suite_title=True, use_unit_test_id=False)
```

### Running a command without creating a test

It is also possible to run a command that is not directly linked to a specific test. This can be done with the `self.run_command()` method, which at the minimum receives a command as argument. This command can be a single string with or without arguments, or an array of strings containing the executable as the first element, and the arguments to follow. The method returns a string contaning the standard output (and standard error) generated by the program.

```python
files = self.run_command('ls -alR /grade')
files = self.run_command(['ls', '-alR', '/grade'])
```

The command by default will run as a [sandboxed user](#sandbox-execution). If you need to run the command as the container's `root` (the same user running the test script itself) you may set the argument `sandboxed` to `False` (not recommended for any program provided by a student):

```python
result = self.run_command('rm -rf testfile.txt', sandboxed=False)
```

To provide a string to be used as standard input for the program, use the `input` argument:

```python
result = self.run_command('./square', input='3\n')
```

To ensure the program does not run forever, you may set a `timeout` option, which provides a timeout in seconds. If the program doesn't complete within this timeout, the method will return a standard timeout message. It is highly recommended that student-provided code run with a timeout setting.

```python
result = self.run_command('./square', timeout=1)
```

If the program requires specific environment variables, you may set the `env` argument. This argument must be provided as a key-value `dict`.

```python
result = self.run_command('./square', env={'TEMP_FILE': '/tmp/my_temp.dat'})
```

### Manually adding test results

Methods like `self.test_compile_file()` and `self.test_run()` will create a new test result that will be presented to the user. It is also possible to create your own tests based on separate computations, with the `self.add_test_result()` method. The simplest invocation of this method is with only the test name, which will create a passing test worth one point, with no message, no output and no description.

```python
self.add_test_result('Bonus point for submitting something!')
```

You may also optionally add a description, message and output to the test:

```python
self.add_test_result('Bonus point for submitting something!',
                     description='This is for all my students, thank you for submitting.',
                     msg='Nothing to be expected.',
                     output=submitted_answer)
```

To set the number of points the test is worth, and/or its maximum number of points, use the `points` and `max_points` arguments. The `max_points` value must be a number (integer or float), and defaults to `1` if not provided. The `points` argument can be a number, in which case it is based on the maximum number of points; or you may set `points` to a boolean-like expression, in which case `points` will be set to 0 if the expression is `False`, and to `max_points` if the expression is `True`.

```python
self.add_test_result('I am lazy, everyone gets 70%',
                     points=70, max_points=100)
```

This method also allows you to add one or more images to the result. Images must follow the format described in the [external grading](../externalGrading.md) page.

```python
self.add_test_result('Generated image', points=matched_pixels,
                     max_points=total_pixels,
                     images=[{'label': 'Your image', 'url': dataURI},
                             {'label': 'Expected image', 'url': expectedURI})
```

### Code subject to manual review

In some situations, instructors may perform a manual review of the student's code, to check for issues like code style, comments, use of algorithms and other criteria that can't easily be programmed into code. Students may start any testing with code that is not intended to be their final version. It is therefore possible that some students may complete all tests successfully, but still may want to submit further versions of the code more suitable for manual review. Since students are unable to submit a new answer on PrairieLearn after getting 100% of the tests passing, it is advisable, if manual review is to take place, that the autograding never reaches 100%.

One way to ensure that students can always submit a new code even after passing all tests is to include a test that always fails. This can be done with the `add_test_result()` method above, by setting `points` to 0 or `False`. The method `add_manual_grading()` does exactly that, with a standard name and description for the failing test.

```python
self.add_manual_grading(points=10)
```

## Sandbox execution

The autograder is set up to allow program to run either a root, or as a non-privileged user. This feature is available to ensure that the student is unable to manipulate the testing environment or manually modify their grade in the container.

By default, the sandbox user will not have access to any files inside the `/grade` folder in the container. If it is expected that a program running in this environment have access to a specific file, access must be explicitly granted to the user. This can be done with the `change_mode()` method, which receives two arguments: the file name/path, and the mode to be set.

```python
self.change_mode('/grade/student/myfile.txt', '744')
```

Any program compiled with `test_compile_file()` will be granted executable permissions (mode `755`), so these programs don't need to be explicitly allowed by your tests.
