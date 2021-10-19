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
  <pl-file-editor
    file-name="square.c"
    ace-mode="ace/mode/c_cpp"
  ></pl-file-editor>
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

To compile a C or C++ file, you may use the `self.test_compile_file()` method. A simple invocation of this method, assuming the students write a complete C file including the `main` function, will include two parameters: the name of the C or C++ file to be compiled (typically the same name used in the `pl-file-upload` or `pl-file-editor` elements listed above), and the name of an executable file to be created.

```python
self.test_compile_file('square.c', 'square')
```

By default, if the compilation fails, it will stop all tests and return the submission as ungradable. This means that the submission will not count towards the student's submission limit, and the student will not receive a grade. The student will, however, see the result of the compilation. If you would like the tests to proceed in case of failure, you can call the function with:

```python
self.test_compile_file('square.c', 'square', ungradable_if_failed=False)
```

By default, if the compilation succeeds but gives a warning, a message with the warning will be listed in the main results message, above the test results. If you would like the warnings to be listed only inside the results of the specific test, you can call the function with:

```python
self.test_compile_file('square.c', 'square', add_warning_result_msg=False)
```

The results of the compilation will show up as a test named "Compilation", worth one point. To change the name and/or points, set the `name` or `points` argument as follows:

```python
self.test_compile_file('square.c', 'square', name='Compilation of the first file', points=3)
```

You may also include additional compilation flags accepted by `gcc` (or `g++`) with the `flags` argument, which can be invoked with a single string for flags, or with an array of strings:

```python
self.test_compile_file('square.c', 'square', flags='-Wall -O3') # single string
self.test_compile_file('square.c', 'square', flags=['-Wall', '-O3']) # array
```

It is also possible to test a program that is not complete on its own. To compile the C/C++ file submitted by the user with a `main` function implemented by the instructor, you can save a `main.c` (or `main.cpp`) file inside the `tests` folder and run:

```python
self.test_compile_file('square.c', 'square', main_file='/grade/tests/main.c')
```

The instruction above will compile the student-provided C/C++ file with the instructor-provided C/C++ file into the same executable. If the student provides a `main` function, it will be ignored, and the instructor-provided main file will take precedence.

In some situations you may want to include or replace other functions besides `main`. You may do that by placing these functions in a `.c` or `.cpp` file inside the `tests` folder and run:

```python
self.test_compile_file('square.c', 'square', add_c_file='/grade/tests/otherfunctions.c')
```

It is also possible to compile multiple student files and multiple question-provided files into a single executable, by providing lists of files:

```python
self.test_compile_file(['student_file1.c', 'student_file2.c'], 'executable',
                       add_c_file=['/grade/tests/question_file1.c',
                                   '/grade/tests/question_file2.c'],
                       flags=['-I/grade/tests', '-I/grade/student'])
```

If the compilation involves include (`.h`) files, the flags `-I/grade/tests` (for question-provided includes) and `-I/grade/student` (for student-provided includes) are recommended as well. The specific `.h` files don't need to be listed as arguments to `test_compile_file`.

### Running a program and checking its result

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
