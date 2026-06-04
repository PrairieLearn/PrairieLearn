# `clientFiles` and `serverFiles`

There are multiple locations within each course where files can be stored for access from the client or server. These can be used for code libraries used in questions, images embedded within questions, formula sheets available during exams, or online textbooks for reference during exams.

`ClientFiles` directories contain files that are accessible from the client web browser. This is appropriate for files that a student should have access to, such as a static image, reference webpages, or formula sheets, or for code libraries used on the client.

`ServerFiles` directories are only accessible from code running on the server, so are useful for libraries that can solve questions or generate random question instances. Files in a `serverFiles` directory cannot be directly accessed by the student's web browser.

See an [example of how to use `serverFilesCourse`](python-grader/index.md#example-usage-of-serverfilescourse-for-static-data) in a Python autograder.

## Directory layout

A `clientFiles*` subdirectory can be associated with the course, a question, a course instance, or an assessment, as shown below. The `serverFilesCourse` subdirectory is associated with the course as a whole.

```bash
exampleCourse
+-- clientFilesCourse                     # client files for the entire course
|   +-- library.js
+-- serverFilesCourse                     # server files for the entire course
|   `-- secret1.js
+-- questions
|   `-- fossilFuels
|       +-- clientFilesQuestion           # client files for the fossilFuels question
|       |   `-- power-station.jpg
`-- courseInstances
    `-- Fa16
       +-- clientFilesCourseInstance      # client files for the Fall 2016 course instance
       |   `-- Fa16_rules.pdf
       `-- assessments
           `-- hw01
               `-- clientFilesAssessment  # client files for the Homework 1 assessment
                   `-- formulaSheet.pdf
```

## Access control

Each different `clientFiles*` directory is accessible under the same [access control rules](assessment/accessControl.md) for the course instances and assessments. That is, `clientFilesCourse` is accessible to any student who has access to some course instance, while `clientFilesQuestion`, `clientFilesCourseInstance`, and `clientFilesAssessment` are accessible to students with access to the corresponding question, course instance, or assessment.

## Giving students access to client files

To give students access to a file, place the file in the appropriate `clientFiles*` directory. For example, to include an image in a question, place the image in the `clientFilesQuestion` directory for that question. If the image is used in multiple questions, it can be placed in the `clientFilesCourse` directory for the course. To make a formula sheet available during an exam, place the formula sheet in the `clientFilesAssessment` directory for that exam.

To allow students to see the contents of a file from a question, you can make a reference to the file using one of the following methods:

1. The `pl-figure` element can be used to display an image from `clientFilesQuestion` or `clientFilesCourse` in a question. For example, if the image is named `power-station.jpg`, you may save it in `clientFilesQuestion` and then include, in your `question.html` file:

   ```html
   <pl-figure file-name="power-station.jpg" alt="Power Station"></pl-figure>
   ```

   See the [`pl-figure` documentation](./elements/pl-figure.md) for details.

2. The `pl-file-download` element can be used to provide a link for students to download a file from `clientFilesQuestion` or `clientFilesCourse`. For example, to give students access to a starting code file, you may save it in `clientFilesQuestion` and then include, in your `question.html` file:

   ```html
   <pl-file-download file-name="starting-code.py"></pl-file-download>
   ```

   This element can also be used to provide a link for static PDF files or web pages. See the [`pl-file-download` documentation](./elements/pl-file-download.md) for details.

3. To include stylesheets and scripts from `clientFilesCourse` or `clientFilesQuestion` in your question, you can add them as dependencies in the question configuration file. For example, to include a stylesheet named `styles.css` from `clientFilesCourse`, you can add the following to your `info.json` file:

   ```json
   {
     "dependencies": { "clientFilesCourseStyles": ["styles.css"] }
   }
   ```

   See [the question dependencies documentation](./question/overview.md#question-dependencies) for more details on how to include client files as dependencies.

4. Some elements have special support for files in these directories. For example, the `pl-file-editor` element allows a custom mode to be stored in `clientFilesCourse` or `clientFilesQuestion`, and specified using the `ace-mode` attribute. See the [`pl-file-editor` documentation](./elements/pl-file-editor.md#editor-modes) for details.

5. To provide these files in more advanced contexts, such as CSS references, audio/video tracks, or embedded objects, you can use the patterns `{{ options.client_files_course_url }}/filename.ext` and `{{ options.client_files_question_url }}/filename.ext` to get the URL for a file in `clientFilesCourse` or `clientFilesQuestion`, respectively. For example, to include an image from `clientFilesQuestion` as the background for a block, you can add the following to your question's `question.html` file:

   ```html
   <div style="background-image: url('{{ options.client_files_question_url }}/power-station.jpg')">
     <!-- content here -->
   </div>
   ```

!!! warning

    A common pattern used in the past was to use a relative link like `clientFilesQuestion/filename.ext` to access files in `clientFilesQuestion`. This pattern is not officially supported and may not work in all contexts, so you are highly encouraged to replace it with the `{{ options.client_files_question_url }}/filename.ext` pattern instead.

Files in `clientFilesCourseInstance` and `clientFilesAssessment` (as well as `clientFilesCourse`) can be provided to students using the assessment text, which is rendered in the student's assessment overview page. These can be rendered using the `{{ client_files_course_instance }}/filename.ext`, `{{ client_files_assessment }}/filename.ext`, and `{{ client_files_course }}/filename.ext` patterns, which will render the URLs for files in the corresponding `clientFiles*` directory. More details can be found in the [assessment text documentation](assessment/configuration.md#adding-text-and-links-to-assessments).

## Accessing files from `server.py` question code

From within `server.py` question code, you can access files from these special directories using the following special values:

| Directory                 | Variable                                        |
| ------------------------- | ----------------------------------------------- |
| question directory itself | `data["options"]["question_path"]`              |
| `clientFilesQuestion`     | `data["options"]["client_files_question_path"]` |
| `clientFilesCourse`       | `data["options"]["client_files_course_path"]`   |
| `serverFilesCourse`       | `data["options"]["server_files_course_path"]`   |

The options for `clientFilesCourse` and `serverFilesCourse` are also available if you are developing custom elements.

So, for example, if your question generation code requires a data file named `data.csv` that is stored in the `serverFilesCourse` directory, you can access it using the following code:

```python
import os

def generate(data):
    data_file_path = os.path.join(data["options"]["server_files_course_path"], "data.csv")
    # Now you can read from data_file_path to access the contents of data.csv
```

??? note "Using relative paths"

    Although `data["options"]["question_path"]` provides an absolute path to the question directory, the code is executed with the question directory as the current working directory, so you can also access files in the question directory using relative paths. Similarly, you can access files in `clientFilesQuestion` using relative paths, as the directory is guaranteed to be a subdirectory of the question directory. However, `clientFilesCourse` and `serverFilesCourse` are not subdirectories of the question directory and are not guaranteed to be found in any specific location relative to the question directory, so you must use the absolute paths provided in `data["options"]` to access files in those directories.

If your `serverFilesCourse` file contains Python code, your `server.py` code can import that code as a module without the need to update the Python path. The `serverFilesCourse` directory is automatically added to the Python path when executing `server.py` code, so you can simply import the module as if it were in the same directory. For example, if you have a file named `course_utils.py` in `serverFilesCourse`, you can import it in `server.py` using:

```python
import course_utils
```

If you are rendering HTML content in a `render()` function in `server.py` (or a custom element), you can also use the following prefixes to get the URLs for files in `clientFilesCourse` and `clientFilesQuestion`:

| Directory                                                                | Prefix                                                 |
| ------------------------------------------------------------------------ | ------------------------------------------------------ |
| `clientFilesQuestion`                                                    | `data["options"]["client_files_question_url"]`         |
| `clientFilesCourse`                                                      | `data["options"]["client_files_course_url"]`           |
| [dynamic files](./question/server.md#generating-dynamic-files-with-file) | `data["options"]["client_files_question_dynamic_url"]` |

## Accessing files from external graders

Questions using external grading can also have access to content in `serverFilesCourse`. To access these files, the question configuration must explicitly include these files or directories in the external grading configuration in `info.json`. For example, to give an external grader access to a file named `data.csv` in `serverFilesCourse`, you can add the following to your `info.json` file:

```json
{
  "externalGradingOptions": {
    "serverFilesCourse": ["data.csv"]
  }
}
```

More details can be found in the [external grading documentation](externalGrading.md#configuring-and-enabling-external-grader-support).

## Accessing files from workspaces

Questions that use workspaces can also be configured to include files from question directories or `serverFilesCourse`. To access these files, you must add them to the `data["params"]["_workspace_files"]` field in `server.py`. For example, to give a workspace access to a file named `data.csv` in `serverFilesCourse` and a file named `config.json` in `clientFilesQuestion`, you can add the following code to your `server.py`:

```python
def generate(data):
    data["params"]["_workspace_files"] = [
        {"name": "config.json", "questionFile": "clientFilesQuestion/config.json"},
        {"name": "data.csv", "serverFilesCourseFile": "data.csv"},
    ]
```

For more details, see the [workspaces documentation](./workspaces/index.md#creating-files-in-the-workspace-home-directory).
