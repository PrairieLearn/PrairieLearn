# Executor

This image will be used to execute course code in isolation in production environments.

## Build and release process

This image is built and pushed to the container registry as `prairielearn/executor:GIT_HASH`, where `GIT_HASH` is the Git commit hash of the version of PrairieLearn the executor image was built from. This allows us to ensure a given version of PrairieLearn is always running with the correct executor image.

The image is built and pushed to Docker Hub automatically by GitHub Actions.

To build and tag the image for local testing, first ensure that you've built an up-to-date `prairielearn/prairielearn` image, as the `prairielearn/executor` image uses that as its base. You can build a new version by running the following in the root of the repository:

```sh
docker build -t prairielearn/prairielearn:latest .
```

Then, run the following to build a new executor image:

```sh
docker build -t prairielearn/executor:latest ./images/executor
```

## In-dev testing

Build the image using the above instructions.

Start the container, using the version of the container that you noted above (the examples below use the tag `latest`).

```sh
docker run --rm -it prairielearn/executor:latest
# Optionally, enable debug prints
docker run --rm -it -e DEBUG='*' prairielearn/executor:latest
```

Once the container is running, paste the following and hit `Enter`:

```
{"type":"core-element","directory":"pl-checkbox","file":"pl-checkbox","fcn":"prepare","args":["<pl-checkbox answers-name=\"ans\"><pl-answer correct=\"true\">correct</pl-answer></pl-checkbox>",{"params":{},"correct_answers":{}}]}
```

You should see the following printed to the console:

```
{"data":{"params":{"ans":[{"key":"a","html":"correct"}]},"correct_answers":{"ans":[{"key":"a","html":"correct"}]}},"output":"","functionMissing":false}
```

Now, try to render the element:

```
{"type":"core-element","directory":"pl-checkbox","file":"pl-checkbox","fcn":"render","args":["<pl-checkbox answers-name=\"ans\"><pl-answer correct=\"true\">correct</pl-answer></pl-checkbox>",{"params":{"ans":[{"key":"a","html":"correct"}]},"correct_answers":{"ans":[{"key":"a","html":"correct"}]},"submitted_answers":{},"format_errors":{},"partial_scores":{},"score":0,"feedback":{},"variant_seed":3121211659,"raw_submitted_answers":{},"editable":true,"panel":"question"}]}
```

You should see the following printed to the console:

```
{"data":"<script>\n    $(function(){\n        $('#pl-checkbox-19afb311-20b9-4505-b5ad-764166b6394f [data-toggle=\"popover\"]').popover({\n            sanitize: false,\n            container: 'body',\n            template: '<div class=\"popover pl-checkbox-popover\" role=\"tooltip\"><div class=\"arrow\"></div><h3 class=\"popover-header\"></h3><div class=\"popover-body\"></div></div>',\n        });\n    });\n</script>\n\n\n<div class=\"d-block\">\n\n    <div class=\"form-check d-flex align-items-center py-1\">\n        <input class=\"form-check-input mt-0\" type=\"checkbox\"\n               name=\"ans\" value=\"a\" \n                id=\"ans-a\">\n\n        <label class=\"form-check-label d-flex align-items-center\" for=\"ans-a\">\n            <div class=\"pl-checkbox-key-label\">(a)</div>\n            <div class=\"ml-1 mr-1\">correct</div>\n        </label>\n            \n    </div>\n    \n<span class=\"form-inline\">\n    <span id=\"pl-checkbox-19afb311-20b9-4505-b5ad-764166b6394f\" class=\"input-group pl-checkbox\">\n        <span> <small class=\"form-text text-muted\">Select all possible options that apply.</small> </span>\n        <a role=\"button\" class=\"btn btn-light btn-sm\" data-toggle=\"popover\" data-html=\"true\" title=\"Checkbox\" data-content=\"You must select at least one option. You will receive a score of 100% if you select all options that are true and no options that are false. Otherwise, you will receive a score of 0%.\" data-placement=\"auto\" data-trigger=\"focus\" tabindex=\"0\">\n            <i class=\"fa fa-question-circle\" aria-hidden=\"true\"></i>\n        </a>\n    </span>\n</span>\n\n\n\n\n\n\n</div>","output":"","functionMissing":false}
```

# Debugging

If you're using a Mac or Windows machine and you see workers exiting shortly after starting up, you might be running out of resources in the Docker VM. Workers use ~200MB of memory each, the memory limit on the Docker VM is 2GB by default, and PrairieLearn defaults to using one worker per CPU, so for machines with 10+ cores, you can easily exhaust the memory in the VM. Try reducing the number of workers via `"workersCount"` in `config.json`, or try increasing the memory limit of Docker.
