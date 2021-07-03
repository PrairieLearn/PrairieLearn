# Creating a Pull Request to Add Python Libs

Are you creating questions and finding that PrairieLearn does not have the Python libraries you need?  Don't panic!  Creating a request for changes to add these necessary libraries is very easy and will only require a few minutes of work on your end.

### 1. Locate the library and version on PyPI

PrairieLearn downloads all of its Python packages from the [*Python Package Index*](https://pypi.org); your first step should be to locate the package there and version you want.  You can find the versions under "Release history" on the left.  Most of the time the latest version should be chosen unless there is a specific need for an older release.

<center>![](scipy_version.png)</center>
<center><small>Example for SciPy.  The newest release as of writing this guide is `1.6.1`.</small></center>

### 2. Add the library to `python-requirements.txt`

A list of of the Python libraries that PrairieLearn uses is stored in a file called `python-requirements.txt`.  The easiest way to propose a change to this file is to use the web interface (if you are familiar with Git and pull requests you may do that, but this will not be included for simplicity's sake).

First, browse to the file `images/plbase/python-requirements.txt` in the [PL GitHub Repo](https://github.com/prairielearn/prairielearn).  An edit button should be visible on the top right of the file preview:

<center>![](edit_btn.png)</center>

Clicking the edit button will automatically create a new branch or fork that you can propose changes on.  At the end of the file, input your library and version on a new line in the format `library==version`.

<center>![](scipy_propose.png)</center>

At the bottom of the page you can give a descriptive title to your changes.  Something like `Add <library>:<version> to PrairieLearn` is acceptable.  When you are happy with your edits, you can click "Propose changes" to finalize the pull request.

### 3. Wait for approval

If you've reached this point, then you're all finished!  One of the PrairieLearn administrators will look over your pull request and merge the changes within a few days.
