# Adding new Python Libraries for Questions

Are you creating questions and finding that PrairieLearn does not have the Python libraries you need? Don't panic! There are a few different options you have for getting the necessary libraries installed.

## Installing Libraries locally to your course

The quickest way to add custom libraries is to install them directly to your course. This will assume that you have (at least passing) knowledge of using Git and Docker. If you are not familiar, it is recommended to follow the [Installing PL for local development](../installing.md) guide.

1. Check out a copy of your course locally with Git, and make sure it is up-to-date (i.e., you have pulled the latest master).
2. Locate the package that you would like to install. You can find a list of all the available Python libraries at the [_Python Package Index_](https://pypi.org).
3. Install the package to your courses's `serverFileCourse` directory. You can use the command
    ```
    docker run -it --rm -v <path-to-course>:/course prairielearn/prairielearn pip3 install -target /course/serverFilesCourse <library>
    ```
    replacing `<path-to-course>` and `<library>` with the absolute path to the course on your local computer, and the library you wish to install.
4. Using Git, commit and push the new files that are now in your `serverFilesCourse` directory.

After these steps, you should be able to `import` the library as normal in your `server.py` files.

## Creating a Pull Request for PrairieLearn

If the library itself is very large or instaling it to your course is otherwise somehow infeasible, the other option is to create a pull request to add the library to PrairieLearn itself. This process will definitely take more time, as your change will have to be merged and then deployed to the live server. So, only use this in cases where the first option did not work.

### 1. Locate the library and version on PyPI

PrairieLearn downloads all of its Python packages from the [_Python Package Index_](https://pypi.org); your first step should be to locate the package there and version you want. You can find the versions under "Release history" on the left. Most of the time the latest version should be chosen unless there is a specific need for an older release.

![](scipy_version.png)
Example for SciPy. The newest release as of writing this guide is `1.6.1`.

### 2. Add the library to `python-requirements.txt`

A list of of the Python libraries that PrairieLearn uses is stored in a file called `python-requirements.txt`. The easiest way to propose a change to this file is to use the web interface (if you are familiar with Git and pull requests you may do that, but this will not be included for simplicity's sake).

First, browse to the file `images/plbase/python-requirements.txt` in the [PL GitHub Repo](https://github.com/prairielearn/prairielearn). An edit button should be visible on the top right of the file preview:

![](edit_btn.png)

Clicking the edit button will automatically create a new branch or fork that you can propose changes on. At the end of the file, input your library and version on a new line in the format `library==version`.

![](scipy_propose.png)

At the bottom of the page you can give a descriptive title to your changes. Something like `Add <library>:<version> to PrairieLearn` is acceptable. When you are happy with your edits, you can click "Propose changes" to finalize the pull request.

### 3. Wait for approval

If you've reached this point, then you're all finished! One of the PrairieLearn administrators will look over your pull request and merge the changes within a few days.
