
PrairieLearn
============

PrairieLearn is an online problem-driven learning system. It consists
of a server component that presents questions and other data via an
API, and a webapp that interfaces with the user and communicates with
the server.

Building
--------

1. Install the pre-requisites:

  * [Node.js](http://nodejs.org/)
  * [npm](https://npmjs.org/)
  * [MongoDB](http://www.mongodb.org/)

  On OS X these can be installed with [MacPorts](http://www.macports.org/) or [Homebrew](http://brew.sh/).

2. Next clone the latest code:

        $ git clone https://github.com/PrairieLearn/PrairieLearn.git

3. Install the backend libraries:

        $ cd PrairieLearn/backend
        $ npm install

4. (Optional) Render question TeX image files for figures

        $ cd PrairieLearn/backend
        $ make


Running the server
------------------

1. Run the database:

        $ mongod --dbpath ~/db

2. Run the server:

        $ cd PrairieLearn/backend
        $ node server

3. In a web-browswer view the PrairieLearn/frontend/index.html file:

        $ open file://...<path>.../PrairieLearn/frontend/index.html


To test the database, you can access it directly:

    $ mongo
    > show dbs
    > use data
    > show collections
    > db.users.find()
    > db.users.save({uid: "user1@illinois.edu"})

To test the server, you can access it from the commandline:

    $ curl http://localhost:3000/questions
    $ curl http://localhost:3000/questions/scalarAdd

    $ curl -H "X-Auth-UID: user1@illinois.edu" -H "X-Auth-Name: User Name" -H "X-Auth-Date: 2013-08-17T09:44:18Z" -H "X-Auth-Signature: 3d38a7acba63047cf8bcf29f9691c68a2cae30e3ae5057ef1ea4616d2060a4be" http://localhost:3000/users
    $ curl -H "X-Auth-UID: user1@illinois.edu" -H "X-Auth-Name: User Name" -H "X-Auth-Date: 2013-08-17T09:44:18Z" -H "X-Auth-Signature: 3d38a7acba63047cf8bcf29f9691c68a2cae30e3ae5057ef1ea4616d2060a4be" http://localhost:3000/users/user1@illinois.edu

    $ curl -H "X-Auth-UID: user1@illinois.edu" -H "X-Auth-Name: User Name" -H "X-Auth-Date: 2013-08-17T09:44:18Z" -H "X-Auth-Signature: 3d38a7acba63047cf8bcf29f9691c68a2cae30e3ae5057ef1ea4616d2060a4be" -H "Accept: application/json" -H "Content-type: application/json" -X POST -d '{"uid": "user1@illinois.edu", "qid": "scalarAdd"}' http://localhost:3000/qInstances

    $ curl http://localhost:3000/questions/scalarAdd/1/question.html
    $ curl http://localhost:3000/questions/scalarAdd/1/client.js
    $ curl http://localhost:3000/questions/scalarAdd/1/params

    $ curl -H "X-Auth-UID: user1@illinois.edu" -H "X-Auth-Name: User Name" -H "X-Auth-Date: 2013-08-17T09:44:18Z" -H "X-Auth-Signature: 3d38a7acba63047cf8bcf29f9691c68a2cae30e3ae5057ef1ea4616d2060a4be" -H "Accept: application/json" -H "Content-type: application/json" -X POST -d '{"uid": "user1@illinois.edu", "qid": "scalarAdd", "vid": "1", "qiid": "qi32", "submittedAnswer": {"c": "43"}}' http://localhost:3000/submissions

Useful curl options:

    --trace
    --trace-time
    -w, --write-out
    -v, --verbose


Accessing the client
--------------------

To access the client we can either run a webserver locally or acess
the files directly from disk.

### Accessing files directly from disk

Simply open `frontend/index.html` in a web browser. Chrome will give
cross-origin errors when loading non-javascript from disk, so it must
be run with the `--allow-file-access-from-files` commandline
argument. Under OS X this can be done with:

    open '/Applications/Google Chrome.app' --new --args --allow-file-access-from-files

On Windows this can be done by adding the
`--allow-file-access-from-files` flag to a special shortcut (edit it
with right-click and properties -> target).

To disable cross-origin errors in Firefox go to `about:config` and set
`security.fileuri.strict_origin_policy` to `false`.

### Run a local webserver

Any webserver that can serve up the `frontend` directory tree can be
used to access the client. One particularly easy way to do this is to
run `python -m SimpleHTTPServer` in the `frontend` directory, and then
point the webbrowser to `http://localhost:8000`.


Restore of the database
----------------------------------

When the DB is stopped:

    mongorestore --dbpath ~/db ~/path-to-dump


Miscellaneous Notes
===================

### Run grunt to check code

    $ sudo npm install -g grunt-cli
    $ grunt

### Use `marked` to process markdown

    $ sudo npm install -g marked
    $ marked --gfm README.md > README.html


Tools and libraries
===================

* [Node.js](http://nodejs.org/)
* [npm](https://npmjs.org/)
* [MongoDB](http://www.mongodb.org/)
* [Express](http://expressjs.com/)
* [jQuery](http://jquery.com/)
* [Underscore.js](http://underscorejs.org/)
* [Backbone.js](http://backbonejs.org/)
* [Bootstrap](http://getbootstrap.com/)
* [Grunt](http://gruntjs.com/)
* [async](https://github.com/caolan/async)
* [JSHint](http://www.jshint.com/)
* [RequireJS](http://requirejs.org/)
* [tween.js](https://github.com/sole/tween.js/)
* [Sylvester](http://sylvester.jcoglan.com/)
* [MathJax](http://www.mathjax.org/)
* [Rivets.js](http://rivetsjs.com/)


Deploying to a Vagrant virtual machine
======================================

Install:

* VirtualBox: http://www.virtualbox.org/
* Vagrant: http://www.vagrantup.com/

In the `PrairieLearn` directory run:

    vagrant up            # download and boot the VM and install packages

To run the PrairieLearn server do:

    vagrant ssh           # login to the VM
    cd /vagrant/backend   # change to the PrairieLearn backend server directory
    npm install           # install libary packages (one time only)
    make                  # compile latex in figures (only after changing figure latex)
    grunt                 # check code for syntax and style (optional)
    node server           # run the PrairieLearn server

When the server is running, access PrairieLearn in a web browser on
the host at the URL http://localhost:8080/

To stop the server and logout of the VM:

    ctrl-c                # stop the server
    logout                # logout of the VM (can also use ctrl-d)

Other useful vagrant commands on the host:

    vagrant halt          # shutdown the VM
    vagrant destroy       # delete the VM completely
    vagrant up            # start the VM again (after halt or destroy)
    vagrant suspend       # suspend the VM
    vagrant resume        # resume a suspended VM
