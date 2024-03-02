Similarly to elements, questions can pull in external CSS and JavaScript dependencies by listing them in the `dependencies` table in the question's `info.json`. Questions can pull an almost identical list of dependencies as elements can, except `elementStyles` and `elementScripts` are replaced with `clientFilesQuestionStyles` and `clientFilesQuestionScripts`, respectively.

The dependencies for this example are given by:

```js
"dependencies": {
    "clientFilesQuestionStyles": [ "style.css" ],
    "clientFilesQuestionScripts": [ "script.js" ]
}
```

CSS (`style.css`):
<pl-code source-file-name="clientFilesQuestion/style.css" language="css"></pl-code>

JavaScript (`script.js`):
<pl-code source-file-name="clientFilesQuestion/script.js" language="js"></pl-code>

<span id="demo-span"></span>
