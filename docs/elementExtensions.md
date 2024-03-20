# Element extensions developer guide

Extensions are a way to add custom logic and extra complexity to already existing elements. Each element has the ability to load relevant extensions and as such, extensions should be custom tailored to one specific element.

## Extension anatomy

Extensions can be defined in a course only, and are located in `[course directory]/elementExtensions`. This folder is organized such that elements are contained as subfolders, and extensions are then contained inside the element folders. For example, if you had an extension `exampleExtension` that extended `exampleElement`, the folder structure would be: `[course directory]/elementExtensions/exampleElement/exampleExtension`.

Each extension needs only an `info.json` containing metadata about the element, and can contain optional information like Python scripts, CSS styles, and clientside JavaScript files.

The `info.json` file is structurally similar to the element info file and may contain the following fields:

```json
{
  "controller": "Python script",
  "dependencies": {
    "nodeModulesStyles": ["style_file_path"],
    "nodeModulesScripts": ["script_file_path"],
    "clientFilesCourseStyles": ["style_file_path"],
    "clientFilesCourseScripts": ["script_file_path"],
    "extensionStyles": ["style_file_path"],
    "extensionScripts": ["script_file_path"]
  },
  "dynamicDependencies": {
    "nodeModulesScripts": { "module_name": "module_path" },
    "clientFilesCourseScripts": { "file_name": "file_path" },
    "extensionScripts": { "file_name": "file_path" }
  }
}
```

### Python Controller

The main Python controller script has no general structure and is instead defined by the element that is being extended. Any global functions and variables are available for use by the host element.

A host element can call the `load_extension()` function to load one specific extension, or `load_all_extensions()` to load everything that is available. These are defined in the freeform `prairielearn` module.

A two-way flow of logic and information exists between elements and their extensions.

##### Importing an Extension From an Element

Loading extension Python scripts returns a named tuple of all globally defined functions and variables. Loading all extensions will return a dictionary mapping the extension name to its named tuple. For example, if an extension were to define the following in their controller:

```python
def my_cool_function():
    return "hello, world!"
```

The host element could then call this by running the following:

```python
import prairielearn as pl

def render(element_html, data):
    extension = pl.load_extension(data, "extension_name")
    contents = extension.my_cool_function()
    return contents
```

This small example above will render `"hello world!"` to the question page. Note that when loading all extensions with `load_all_extensions()`, modules are returned in ascending alphabetical order.

##### Importing a Host Element From an Extension

Extensions can also import files from their host element with the `load_host_script()` function. This can be used to obtain helper functions, class definitions, constant variables, etc.
If the host element were to contain, for example:

```python
import prairielearn as pl

STATIC_VARIABLE = "hello"

def render(element_html, data):
    extension = pl.load_extension(data, "extension_name")
    contents = extension.my_cool_function()
    return contents
```

The extension could then access `STATIC_VARIABLE` by importing the host script:

```python
import prairielearn as pl

host_element = pl.load_host_script("pl-host-element.py")

def my_cool_function():
    return host_element.STATIC_VARIABLE
```

### Extension Dependencies

Similar to how questions and elements may require client-side assets (as described in the [element developer guide](devElements.md#element-dependencies)), extensions may also require client-side JavaScript and CSS. The different properties are summarized here. Note that script dependencies may be set as either static or dynamic dependencies, while styles may only be set as static dependencies.

| Property                   | Description                                                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `nodeModulesStyles`        | The styles required by this extension, relative to `[PrairieLearn directory]/node_modules`.                                                     |
| `nodeModulesScripts`       | The scripts required by this extension, relative to `[PrairieLearn directory]/node_modules`.                                                    |
| `extensionStyles`          | The styles required by this element relative to the extension's directory, `[course directory]/elementExtensions/element-name/extension-name`.  |
| `extensionScripts`         | The scripts required by this element relative to the extension's directory, `[course directory]/elementExtensions/element-name/extension-name`. |
| `clientFilesCourseStyles`  | The styles required by this extension relative to `[course directory]/clientFilesCourse`.                                                       |
| `clientFilesCourseScripts` | The scripts required by this extension relative to `[course directory]/clientFilesCourse`.                                                      |

Note that any element extension assets declared in `dependencies` will always be loaded, regardless of whether their Python controller was loaded or not. As such, it is recommended that, when suitable, extensions make use of `dynamicDependencies` to load scripts only when necessary, based on the context/usage of the element.

### Other Client Files

Other files available to the client may also be loaded, such as images or any downloadable content. These client files should be placed in `clientFilesExtension` in the extension directory, and the full URL to that folder is given to the host extension in `data["options"]["client_files_extensions_url"][extension_name]`. If this path is needed by the extension itself, it may be passed as an argument to a defined extension function.
