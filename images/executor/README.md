# Executor

This image will be used to execute course code in isolation in production environments.

## Release process

This image is built and pushed to the container registry as `prairielearn/executor:VERSION`, where version is a string in the `EXECUTOR_VERSION` file in the root of the PrairieLearn repository. This allows us to consistently identify which version of this container should be used by any given version of PrairieLearn. For example, if some revision of PrairieLearn has an `EXECUTOR_VERSION` file with the contents `v123`, that version of PrairieLearn will execute code in the `prairielearn/executor:v123` image.

There are scripts in the `/tools` directory that will aid with the building and releasing of this image. They will automatically pull the version from `EXECUTOR_VERSION` and use it when tagging the resulting image. The scripts should be run from the root of the repository.

To build and tag the image for local testing, run:

```sh
./tools/build-executor.sh
```

To build and tag the image and push it to the container registry, run:

```
./tools/release-executor.sh
```

**IMPORTANT**: Whenever files for this image or the `prairielearn/plbase` image (upon which this image is built) are modified, the version in `EXECUTOR_VERSION` should be increased. Once a version is used, it should not be reused. The continuous integration process should help ensure that the version is changed whenever relevant files are also modified.

## In-dev testing

Build the image using the above `build-executor.sh` script. Make note of the name of the resulting image; you'll need this image name momentarily.

Start the container, using the version of the container that you noted above (the examples below use version `v123`). Note that we mount in the PrairieLearn `elements` directory so that the examples below can use PrairieLearn's elements:

```sh
docker run --rm -it -v /path/to/checked/out/PrairieLearn/elements/:/elements/ prairielearn/executor:v123
# Optionally, enable debug prints
docker run --rm -it -e DEBUG='*' -v /path/to/checked/out/PrairieLearn/elements/:/elements/ prairielearn/executor:v123
```

Once the container is running, paste the following and hit `Enter`:

```json
{"type":"element","directory":"pl-checkbox","file":"pl-checkbox","fcn":"prepare","args":["<pl-checkbox answers-name=\"ans\"><pl-answer correct=\"true\">correct</pl-answer></pl-checkbox>",{"params":{},"correct_answers":{}}]}
```

You should see the following printed to the console:

```json
{"data":{"params":{"wig":[{"key":"a","html":"wig"}]},"correct_answers":{"wig":[{"key":"a","html":"wig"}]}},"output":"","functionMissing":false}
```

Now, try to render the element:

```json
{"type":"element","directory":"pl-checkbox","file":"pl-checkbox","fcn":"render","args":["<pl-checkbox answers-name=\"ans\"><pl-answer correct=\"true\">correct</pl-answer></pl-checkbox>",{"editable":true,"params":{},"correct_answers":{},"submitted_answers":{},"panel":"question","partial_scoress":{}}]}
```

You should see the following printed to the console:

```json
{"data":"<script>\n    $(function(){\n        $('#pl-checkbox-528e174e-1589-4810-aa56-ae752717e777 [data-toggle=\"popover\"]').popover({\n            sanitize: false,\n            container: 'body',\n            template: '<div class=\"popover pl-checkbox-popover\" role=\"tooltip\"><div class=\"arrow\"></div><h3 class=\"popover-header\"></h3><div class=\"popover-body\"></div></div>',\n        });\n    });\n</script>\n\n\n<div class=\"d-block\">\n\n\n\n<span class=\"form-inline\">\n    <span id=\"pl-checkbox-528e174e-1589-4810-aa56-ae752717e777\" class=\"input-group pl-checkbox\">\n        <span> <small class=\"form-text text-muted\">Select all possible options that apply.</small> </span>\n        <span class=\"btn btn-sm \" role=\"button\" data-toggle=\"popover\" data-html=\"true\" title=\"Checkbox\" data-content=\"You must select at least one option. You will receive a score of 100% if you select all options that are true and no options that are false. Otherwise, you will receive a score of 0%.\" data-placement=\"auto\" data-trigger=\"focus\" tabindex=\"0\">\n            <i class=\"fa fa-question-circle\" aria-hidden=\"true\"></i>\n        </span>\n    </span>\n</span>\n\n\n\n\n\n\n</div>","output":"","functionMissing":false}
```
