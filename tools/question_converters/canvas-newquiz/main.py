import json
import re
import shutil
import textwrap

import bs4
import requests
from dataclasses import dataclass
from uuid import uuid4
from pathlib import Path


from swagger_client import *


@dataclass
class StyleCustomizations:
    # Items next to checkboxes and radios are not vertically aligned to the checkbox
    choice_alignment_fix: bool = False
    # Checkboxes and radios have a letter-key (a), (b) label
    choice_remove_letter_id: bool = False

@dataclass
class CanvasConfig:
    debug: bool
    host: str
    token: str
    course_id: int
    quiz_id: int
    questions_dir: Path
    download_images: bool
    styling: StyleCustomizations

def str_to_ident(s: str) -> str:
    return re.sub(r"\W+", "-", s).lower()

def placeholder_ident() -> str:
    ident = f"generated-{uuid4()}"
    print(f"Using placeholder ID '{ident}'. REPLACE with a human friendly name.")
    return ident

def vendor_images(html: str) -> (str, list[Path]):
    root = bs4.BeautifulSoup(html, features="html.parser")
    images = []
    for img in root.find_all("img", recursive=True):
        if "src" in img.attrs:
            img_file = Path("/tmp") / f"image-{placeholder_ident()}"
            img_file.write_bytes(requests.get(img["src"]).content)
            images.append(img_file)
            img["src"] = "{{options.client_files_question_url}}/" + img_file.name
    return str(root), images

class Canvas:
    quiz_items: list[QuizItem]

    def __init__(self, config: CanvasConfig):
        api_config = Configuration()
        api_config.debug = config.debug
        api_config.host = config.host

        api = ApiClient(api_config)
        api.default_headers["Authorization"] = f"Bearer {config.token}"

        self.quiz: NewQuiz = NewQuizzesApi(api).get_new_quiz(config.course_id, config.quiz_id)
        self.quiz_items: list[QuizItem] = NewQuizItemsApi(api).list_quiz_items(config.course_id, config.quiz_id)

        config.questions_dir.mkdir(parents=True, exist_ok=True)

        self.config = config
        self.api = api

    def render_items(self):
        for item in self.quiz_items:
            self.render(item)

    def create_info(self, info_dir: Path, title: str):
        info_json = info_dir / "info.json"
        info_json.write_text(json.dumps({
            "uuid": str(uuid4()),
            "title": title,
            "topic": self.quiz.title,
            "type": "v3",
            "tags": []
        }))

    def vendor_html(self, html: str):
        if self.config.download_images:
            vendored_html, images = vendor_images(html)
            yield from images
            yield vendored_html
        else:
            yield html

    # The generator can yield multiple types
    # - a string item is embedded as the question content
    # - a Path item is stored in the clientFilesQuestion directory
    def render_question(self, title: str, generator):
        qn_dir: Path = self.config.questions_dir / title
        qn_dir.mkdir(exist_ok=True)
        self.create_info(qn_dir, title)

        course_files_qn_dir = qn_dir / "clientFilesQuestion"

        def handle_type(gen):
            for item in gen:
                if isinstance(item, str):
                    yield item
                elif isinstance(item, Path):
                    course_files_qn_dir.mkdir(exist_ok=True)
                    shutil.move(item, course_files_qn_dir)
                else:
                    raise NotImplementedError(item)

        (qn_dir / "question.html").write_text("\n".join(handle_type(generator)))

    def render(self, item: QuizItem):
        default_title = f"Imported from Canvas: Question ID {item.id}"
        match item.entry_type:
            case "Stimulus":
                entry: StimulusItem = self.api.deserialize_impl(item.entry, StimulusItem)
                self.render_question(entry.title or default_title, self.render_stimulus(item.id, entry))
            case "Item" if item.stimulus_quiz_entry_id:
                pass # We have already handled this in a stimulus
            case "Item":
                entry: QuestionItem = self.api.deserialize_impl(item.entry, QuestionItem)
                self.render_question(entry.title or default_title, self.render_question_item(entry))
            case "BankEntry":
                entry: BankEntryItem = self.api.deserialize_impl(item.entry, BankEntryItem)
                match entry.entry_type:
                    case "Item":
                        question_item: QuestionItem = self.api.deserialize_impl(entry.entry, QuestionItem)
                        self.render_question(question_item.title or default_title, self.render_question_item(question_item))
                    case "StimulusItem":
                        stim_item: StimulusItem = self.api.deserialize_impl(entry.entry, StimulusItem)
                        self.render_question(stim_item.title or default_title, self.render_stimulus(item.id, stim_item))
                    case _:
                        raise NotImplementedError(entry)
            case _:
                print(f"Unhandled entry_type {item.entry_type} in QuizItem {item.id=}. Implement if necessary.")

    def render_stimulus(self, stim_id: str, entry: StimulusItem):
        yield "<pl-question-panel>"
        yield from self.vendor_html(entry.body)
        yield "<hr>"

        sub_items = [sub_item for sub_item in self.quiz_items if sub_item.stimulus_quiz_entry_id == stim_id]
        assert(all(map(lambda it: it.entry_type == "Item", sub_items)))
        assert len(sub_items) > 0

        for sub_item in sub_items:
            question: QuestionItem = self.api.deserialize_impl(sub_item.entry, QuestionItem)
            yield from self.render_question_item(question)
            yield "<hr>"

        yield "</pl-question-panel>"

    def render_question_item(self, entry: QuestionItem):
        choice_alignment_class = ("class='canvas-newquiz-alignment-fix'"
                 if self.config.styling.choice_alignment_fix else "")
        choice_alignment_style = textwrap.dedent("""
            <style>
                .canvas-newquiz-alignment-fix p:last-of-type {
                    margin-bottom: unset;
                }
            </style>
        """)
        choice_letter_key = ("hide-letter-keys=true" if self.config.styling.choice_remove_letter_id else "")

        match entry.interaction_type_slug:
            case "multi-answer":
                yield from self.vendor_html(entry.item_body)
                answers_name = str_to_ident(entry.title or placeholder_ident())

                if self.config.styling.choice_alignment_fix:
                    yield choice_alignment_style

                yield f"<div {choice_alignment_class}>"
                yield f'<pl-checkbox answers-name="{answers_name}" {choice_letter_key}>'
                choices: dict = entry.interaction_data["choices"]
                for choice in choices:
                    correct = "true" if choice["id"] in entry.scoring_data["value"] else "false"
                    yield f"<pl-answer correct=\"{correct}\">"
                    yield from self.vendor_html(choice["item_body"])
                    yield "</pl-answer>"
                yield "</pl-checkbox>"
                yield "</div>"

            case "essay":
                yield from self.vendor_html(entry.item_body)
                yield f"<pl-rich-text-editor file-name='{str_to_ident(entry.title or placeholder_ident())}'>"
                yield "</pl-rich-text-editor>"

            case "rich-fill-blank":
                text = entry.item_body
                for blank in entry.scoring_data["value"]:
                    # NOTE: We're approximating the matchers on Canvas to `correct-answer` on PL.
                    # For more advanced cases, implement your custom string matching in a question's server.py
                    assert blank["scoring_algorithm"] in ["TextContainsAnswer", "TextEquivalence"]
                    text = text.replace(f'<span id="blank_{blank["id"]}"></span>',
                                        f'<pl-string-input answers-name="{blank["id"]}" '
                                        f'correct-answer="{blank["scoring_data"]["value"]}">'
                                        f'</pl-string-input>')
                yield text

            case "choice":
                yield from self.vendor_html(entry.item_body)

                if self.config.styling.choice_alignment_fix:
                    yield choice_alignment_style

                yield f"<div {choice_alignment_class}>"
                yield f"<pl-multiple-choice answers-name='{str_to_ident(entry.title or placeholder_ident())}' {choice_letter_key}>"
                for choice in entry.interaction_data["choices"]:
                    correct = "true" if choice["id"] == entry.scoring_data["value"] else "false"
                    yield f"<pl-answer correct='{correct}'>"
                    yield from self.vendor_html(choice['item_body'])
                    yield "</pl-answer>"
                yield "</pl-multiple-choice>"
                yield "</div>"

            case "matching":
                yield from self.vendor_html(entry.item_body)
                yield f"<pl-matching answers-name='{str_to_ident(entry.title or placeholder_ident())}'>"
                for element in entry.scoring_data["edit_data"]["matches"]:
                    yield f"<pl-statement match={element['question_id']}>"
                    yield from self.vendor_html(element['question_body'])
                    yield "</pl-statement>"
                    yield f"<pl-option name='{element['question_id']}'>"
                    yield from self.vendor_html(element['answer_body'])
                    yield "</pl-option>"
                yield "</pl-matching>"

            case "categorization":
                # Note: We're actually converting this to `pl-matching` here
                yield from self.vendor_html(entry.item_body)
                yield f"<pl-matching answers-name='{str_to_ident(entry.title or placeholder_ident())}'>"
                for category in entry.scoring_data["value"]:
                    # First the category
                    yield f"<pl-option name='{category['id']}'>"
                    yield from self.vendor_html(entry.interaction_data['categories'][category['id']]['item_body'])
                    yield "</pl-option>"
                    # Now do distractors
                    for dist_id in category["scoring_data"]["value"]:
                        yield f"<pl-statement match='{category['id']}'>"
                        yield from self.vendor_html(entry.interaction_data['distractors'][dist_id]['item_body'])
                        yield "</pl-statement>"
                yield "</pl-matching>"

            case other:
                print(f"Unhandled interaction type {other} in QuestionItem. Implement if necessary.")

def main():
    config = CanvasConfig(debug=False, host="https://canvas.ubc.ca/api",
                          token="",
                          course_id=155642, quiz_id=1907638,
                          questions_dir=Path(""),
                          download_images=True,
                          styling=StyleCustomizations(
                              choice_alignment_fix=True,
                              choice_remove_letter_id=True))
    canvas = Canvas(config)
    canvas.render_items()

if __name__ == '__main__':
    main()
