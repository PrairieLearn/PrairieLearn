import faker
import os
import io
import zipfile
import chevron


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

        # First, generate python file
        file_path = os.path.join(
            data["options"]["question_path"],
            "fileTemplates",
            "python_file_template.mustache",
        )
        with open(file_path, "r") as f:
            python_file_contents = chevron.render(
                f, {"function_name": params_dict["function_name"]}
            )

        # Create buffer for zipping
        zip_buffer = io.BytesIO()

        # Fill zip file
        with zipfile.ZipFile(zip_buffer, "a") as zip_file:
            zip_file.writestr(params_dict["python_file_name"], python_file_contents)
            zip_file.writestr(
                params_dict["text_file_name"], params_dict["words_for_text"]
            )

        # TODO for whatever reason, the contents that get returned aren't written to this file.
        # Need to fix before merging
        return zip_buffer
