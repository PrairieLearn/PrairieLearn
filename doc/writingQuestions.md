
# Writing questions in PrairieLearn



## Generating LaTeX labels on figures

When using `PrairieDraw.js` to draw figures, figure labels can be included using either plain text, like `pd.text(..., "label")`, or with LaTeX, like `pd.text(..., "TEX:$x$")`. If you are using LaTeX labels then they have to be rendered into image files before they can be displayed, by running the commands:

    cd <FULL-PATH>\PrairieLearn
    ./make_tex_images.py         # on Linux or Mac
    python make_tex_images.py    # on Windows

This needs to be repeated after any LaTeX labels are added or changed. Running these commands requires the installation of [Python](https://www.python.org),  [ImageMagick](http://www.imagemagick.org/), and [LaTeX](http://tug.org/texlive/).

LaTeX labels are searched for by looking for strings of the form `"TEX:..."` or `'TEX:...'` (note the different quote types). Use the `""` form if you want to have `'` characters in the string itself, and vice versa.



## Library code in `clientCode` and `serverCode`

Each course can have JavaScript libraries that are specific to just that course, and can be used from any question in the course. These library files are separated into *client* and *server* libraries. Client libraries are accessible from both `client.js` and `server.js` in each question, while server libraries are only accessible from `server.js`. This means that any secret code that students should not be able to access can be put in a server library, while other non-sensitive code can go in client libraries. There is never a need to put a library file into both the client and server directories, because it can just go only into the client directory and be accessed directly from there by both `client.js` and `server.js`.

To add client library code in the file `library.js`, do the following:

1. In the main course directory (where `questions/` and `tests/` are located), make a directory called `clientCode`.

2. Put the `library.js` file in this new `clientCode` directory. The basic format of `library.js` should be like:

        define([<DEPENDENT-LIBRARIES-PATHS>], function(<DEPENDENT-LIBRARY-VARS>) {
        
            var library = {};
        
            library.add = function(arg1, arg2) {
                return arg1 + arg2;
            };

            // more library functions go here

            return library;
        });

3. Edit the `PrairieLearn\backend\config.json` file to add the line:

        "clientCodeDir": "<FULL-COURSE-PATH>/clientCode",

4. Inside a question's `client.js` or 'server.js`, use the library with:

        define([<OTHER-LIBRARY-PATHS>, 'clientCode/library'], function(<OTHER-LIBRARY-VARS>, library) {
        
            var sum = library.add(3, 5); // sets sum to 8
        
        });

To add a server library then repeat the above steps but with `serverCode` in the place of `clientCode`.