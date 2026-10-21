import importlib

image_capture = importlib.import_module("pl-image-capture")


def test_render_ai_grading_submission_uses_common_file_marker() -> None:
    output = image_capture.render(
        '<pl-image-capture file-name="proof&amp;notes.jpg"></pl-image-capture>',
        {
            "panel": "submission",
            "ai_grading": True,
            "submitted_answers": {
                "_files": [{"name": "proof&notes.jpg", "contents": "imagedata"}]
            },
            "options": {},
        },
    )

    assert output == (
        '<div data-ai-grading-file-name="proof&amp;notes.jpg">proof&amp;notes.jpg</div>'
    )
