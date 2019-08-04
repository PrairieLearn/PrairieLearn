# Executor

Contains code that will be built into a Docker image that will execute course code.

## In-dev testing

Build the image:

```sh
npm run build:docker
```

Start the container, mounting in the PrairieLearn `elements` directory:

```sh
docker run --rm -it -v /Users/nathan/git/PrairieLearn/elements/:/elements/ prairielearn/executor
# Optionally, enable debug prints
docker run --rm -it -e DEBUG='*' -v /Users/nathan/git/PrairieLearn/elements/:/elements/ prairielearn/executor
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
