
# PrairieDraw

## Generating LaTeX labels on figures

When using `PrairieDraw.js` to draw figures in questions, figure labels can be included using either plain text, like `pd.text(..., "label")`, or with LaTeX, like `pd.text(..., "TEX:$x$")`. If you are using LaTeX labels then they have to be rendered into image files before they can be displayed. This is done by running the command:

```sh
docker run -it --rm -v PATH_TO_MY_COURSE:/course prairielearn/prairielearn /PrairieLearn/tools/generate_text.py
```

Replace `PATH_TO_MY_COURSE` above with your local course path directory, such as `/Users/mwest/git/pl-tam212` or `C:/GitHub/pl-tam212`.

LaTeX labels are searched for by looking for strings of the form `"TEX:..."` or `'TEX:...'` (note the different quote types). Use the `""` form if you want to have `'` characters in the string itself, and vice versa.

The above command needs to be repeated after any LaTeX labels are added or changed in questions.

The LaTeX label images will be filenames that look like:

```text
pl-tam212/questions/QID/text/186b41e2a92b8b22694dda1305699937df032555.png
pl-tam212/questions/QID/text/186b41e2a92b8b22694dda1305699937df032555_hi.png
pl-tam212/questions/QID/text/d68de4af4e4de5858554f8a90c5a519d9d435589.png
pl-tam212/questions/QID/text/d68de4af4e4de5858554f8a90c5a519d9d435589_hi.png
```

These files should be committed to the `git` repository and pushed to the live server so that they are available along with the question.

## Advanced: Running without Docker

If you want to generate LaTeX label images without Docker then you will need to install [Python](https://www.python.org),  [ImageMagick](http://www.imagemagick.org/), and [LaTeX](http://tug.org/texlive/) and then run:

```sh
cd <FULL-PATH>/PrairieLearn
python tools/generate_text.py --subdir /path/to/course
```
