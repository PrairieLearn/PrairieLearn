## PrairieLearn Autograding Python Docker Image

The Python autograding docker image is built off of the CentOS 7 docker image.
Python 3.6 is installed on the image alongside an assortment of Python packages
found in the `requirements.txt` file.

Test files whose names contain `.mustache` are mustache processed much like 
`question.html` files for questions, with the resulting file placed in the 
same location but with `.mustache` stripped out. (Hidden directories and
files where `.mustache` only appears at the start are skipped. `.mustache`
must be set off from other extensions by periods, e.g., `test.mustache.txt`
or `test.txt.mustache`.)
