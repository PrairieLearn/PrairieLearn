
# PrairieLearn server configuration

The PrairieLearn server is configured by a JSON file called `config.json` in the current directory when the server is started (with `node server.js`). By default there is no configuration file and a default configuration will be used.

To configure the server, add a file `config.json` (normally this would be in the `PrairieLearn/backend` directory). A typical example in MacOS or Linux is:

    {
        "courseDir": "/Users/mwest/git/pl-tam212"
    }

If you're developing in Windows, you'll need to escape the backslashes in the path with another blackslash. i.e. 

    {
        "courseDir": "D:\\GitHub\\pl-tam212"
    }

The format of `config.json` is specified by the [backend config JSON schema](https://github.com/PrairieLearn/PrairieLearn/blob/master/backend/schemas/backendConfig.json).
