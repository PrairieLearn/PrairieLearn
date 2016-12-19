
# Development Notes

## Miscellaneous Notes

### Run grunt to check code

    $ sudo npm install -g grunt-cli
    $ grunt

### Use `marked` to process markdown

    $ sudo npm install -g marked
    $ marked --gfm README.md > README.html


## Tools and libraries

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


## Direct access to DB and API server

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


## Deploying to a Vagrant virtual machine

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
