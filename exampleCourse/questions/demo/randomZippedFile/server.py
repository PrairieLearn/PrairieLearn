import io
import os
import zipfile

import chevron
import faker


def generate(data):
    params_dict = data["params"]
    fake = faker.Faker()

    params_dict["function_name"] = fake.unique.word()
    params_dict["words_for_text"] = ", ".join(fake.words())
    params_dict["text_file_name"] = f"{fake.unique.word()}.txt"
    params_dict["python_file_name"] = f"{fake.unique.word()}.py"


def file(data):
    if data["filename"] == "generated_files.zip":
        params_dict = data["params"]

        # First, generate python file contents from template
        template_path = os.path.join(
            data["options"]["question_path"],
            "fileTemplates",
            "python_file_template.mustache",
        )
        with open(template_path, "r") as template_file:
            python_file_contents = chevron.render(
                template_file, {"function_name": params_dict["function_name"]}
            )

        # Create buffer for zipping
        zip_buffer = io.BytesIO()

        # Fill zip file
        with zipfile.ZipFile(zip_buffer, "a") as zip_file:
            zip_file.writestr(params_dict["python_file_name"], python_file_contents)
            zip_file.writestr(
                params_dict["text_file_name"], params_dict["words_for_text"]
            )

        return zip_buffer


def grade(data):
    data["score"] = 1
