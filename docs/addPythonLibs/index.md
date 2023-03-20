# The Python Environment for Questions

This page is meant for discussion of details related to the Python environment that questions are run in, along with how to work within this environment for question development. Are you creating questions and finding that PrairieLearn does not have the Python libraries you need? Don't panic! There are a few different options you have for getting the necessary libraries installed that will be discussed below.

## General information

All `server.py` files for questions are executed in a Docker container created from the `prairielearn/prairielearn` image. This image includes the Python version that is bundled with the [latest version of Miniconda](https://docs.conda.io/en/latest/miniconda.html), as well as the packages in [`images/plbase/python-requirements.txt`](https://github.com/PrairieLearn/PrairieLearn/blob/master/images/plbase/python-requirements.txt).

### FAQ

1. To see which packages are installed, run `pip list` in the docker container.

2. To run a command line version of this Python environment, you may start it with the following command:

   ```
   docker run -it --rm prairielearn/prairielearn /bin/bash
   ```

3. To access files on the disk or in `serverFilesCourse` within `server.py`, get the directory from `data["options"]["question_path"]` and similar entries from the `data["options"]` dictionary.

## Installing libraries in your course

The quickest way to add custom libraries is to install them directly to your course. This will assume that you are comfortable using Git and Docker. If you are not familiar, it is recommended to follow the [Installing PL for local development](../installing.md) guide.

1. Check out a copy of your course locally with Git, and make sure the main branch is up-to-date.
2. Locate the package that you would like to install. You can find a list of all the available Python libraries at the [Python Package Index](https://pypi.org).
3. Install the package to your courses's `serverFileCourse` directory. You can use the command
   ```
   docker run -it --rm -v <path-to-course>:/course prairielearn/prairielearn pip3 install --target /course/serverFilesCourse <library>
   ```
   replacing `<path-to-course>` and `<library>` with the absolute path to the course on your local computer, and the library you wish to install.
4. Using Git, commit and push the new files that are now in your `serverFilesCourse` directory.

After these steps, you should be able to `import` the library as normal in your `server.py` files.

## Adding libraries to PrairieLearn

In general, adding a library as a dependency in PrairieLearn is only done in cases where the library has common utility, or local installation is infeasible (due to large size or too many other dependencies). **Please** make sure to attempt to install locally before submitting a pull request. Some discussion on Slack in the (`#pl-help`) channel to find alternative solutions is also recommended.

If the library itself is very large or instaling it to your course is otherwise somehow infeasible, the other option is to create a pull request to add the library to PrairieLearn itself. This process will definitely take more time, as your change will have to be merged and then deployed to the live server. So, only use this in cases where the first option did not work.

### Locate the library and version on PyPI

PrairieLearn downloads all of its Python packages from the [Python Package Index](https://pypi.org); your first step should be to locate the package and version you want. You can find the versions under "Release history" on the left. Most of the time the latest version should be chosen unless there is a specific need for an older release.

![](scipy_version.png)
Example for SciPy. The newest release as of writing this guide is `1.6.1`.

### Add the library to `python-requirements.txt`

A list of of the Python libraries that PrairieLearn uses is stored in a file called `python-requirements.txt`. The easiest way to propose a change to this file is to use the web interface (if you are familiar with Git and pull requests you may do that, but this will not be included for simplicity's sake).

First, browse to the file `images/plbase/python-requirements.txt` in the [PL GitHub Repo](https://github.com/prairielearn/prairielearn). An edit button should be visible on the top right of the file preview:

![](edit_btn.png)

Clicking the edit button will automatically create a new branch or fork that you can propose changes on. At the end of the file, input your library and version on a new line in the format `library==version`.

![](scipy_propose.png)

At the bottom of the page you can give a descriptive title to your changes. Something like `Add <library>:<version> to PrairieLearn` is acceptable. When you are happy with your edits, you can click "Propose changes" to finalize the pull request.

### Wait for review

If you've reached this point, then you're all finished! One of the PrairieLearn maintainers will look over your pull request shortly.
