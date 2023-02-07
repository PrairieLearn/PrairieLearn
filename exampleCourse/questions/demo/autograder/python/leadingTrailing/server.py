import base64


def generate(data):
    data["params"]["names_for_user"] = []
    data["params"]["names_from_user"] = [{"name": "gradient_descent"}]


def base64_encode_string(s):
    # do some wonky encode/decode because base64 expects a bytes object
    return base64.b64encode(s.encode("utf-8")).decode("utf-8")


def parse(data):
    answer = data["submitted_answers"]["answer"]
    answer = (
        (" " * 4) + answer.strip() + "\n"
    )  # add 4 spaces in front and a newline at the end

    # ship the answer off to the autograder
    data["submitted_answers"]["_files"] = [
        {"name": "user_code.py", "contents": base64_encode_string(answer)}
    ]
