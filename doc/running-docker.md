# Running the PrairieLearn Docker image

* Install Docker Community Edition. It's free!
    * On Linux and MacOS this is straightforward. [Download from here](https://store.docker.com/search?type=edition&offering=community).
    * On Windows the best version is [Docker Community Edition for Windows](https://store.docker.com/editions/community/docker-ce-desktop-windows), which requires Windows 10 Pro/Edu. You should install this if at all possible because it is much better than the older "Docker Toolbox".
        * UIUC students and staff can download Windows 10 from [the WebStore](https://webstore.illinois.edu/).

* Run PrairieLearn using the example course with:

```sh
docker run -it --rm -p 3000:3000 prairielearn/prairielearn
```

* Open a web browser and connect to [http://localhost:3000](http://localhost:3000)

* When you are finished with PrairieLearn, type Ctrl-C in the terminal where your ran the server to stop it.

## Using your own course content

To use your own course, point Docker to the correct directory (replace the precise path with your own) on MacOS/Linux:

```sh
docker run -it --rm -p 3000:3000 -v /Users/mwest/git/pl-tam212:/course prairielearn/prairielearn
```

or on Windows:

```sh
docker run -it --rm -p 3000:3000 -v C:\GitHub\pl-tam212:/course prairielearn/prairielearn
```

If you are using Docker for Windows then you will need to first give Docker permission to access the C: drive (or whichever drive your course directory is on). This can be done by right-clicking on the Docker "whale" icon in the taskbar, choosing "Settings", and granting shared access to the C: drive.

If you're in the root of your course directory already, you can substitute `%cd%` (on Windows) or `$PWD` (Linux and MacOS) for `/path/to/course`.
