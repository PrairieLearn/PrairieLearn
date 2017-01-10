
# PrairieDraw

## Advanced: Generating LaTeX labels on figures

When using `PrairieDraw.js` to draw figures, figure labels can be included using either plain text, like `pd.text(..., "label")`, or with LaTeX, like `pd.text(..., "TEX:$x$")`. If you are using LaTeX labels then they have to be rendered into image files before they can be displayed, by running the commands:

    cd <FULL-PATH>/PrairieLearn
    python tools/generate_text.py --subdir /path/to/course

This needs to be repeated after any LaTeX labels are added or changed. Running these commands requires the installation of [Python](https://www.python.org),  [ImageMagick](http://www.imagemagick.org/), and [LaTeX](http://tug.org/texlive/).

LaTeX labels are searched for by looking for strings of the form `"TEX:..."` or `'TEX:...'` (note the different quote types). Use the `""` form if you want to have `'` characters in the string itself, and vice versa.


