#!/usr/bin/env python
# Based on Matt West's randexam python script
# Version 0.0.1 by Lawrence Angrave
# Version 0.0.2 edited by Harry Dankowicz with additional export of tikz figures
# Version 0.1.0 edited by Dave Mussulman to convert to PL v3 question types

# ruff: noqa: B023 -- script abuses inline functions; don't lint unbound variables

import collections
import csv
import difflib
import email.mime.application
import email.mime.multipart
import email.mime.text
import getpass
import itertools
import os
import random
import re
import smtplib
import string
import subprocess
import sys
import time
import uuid

import numpy as np

VERSION = "0.1.0"
RELEASE_DATE = "2020-03-20"
######################################################################


def main():
    if len(sys.argv) != 4:
        print(f"randexam2pl2 version {VERSION} ({RELEASE_DATE})")
        print()
        print("usage: randexam2pl2 mylibrary.tex topic outputdir")
        sys.exit(0)

    LIBRARY_FILENAME = sys.argv[1]
    topic = sys.argv[2]
    OUTPUT_DIRECTORY = sys.argv[3]

    mkdirOrDie(OUTPUT_DIRECTORY)

    init_logging(os.path.join(OUTPUT_DIRECTORY, "log.txt"))

    library = read_library(LIBRARY_FILENAME)
    check_library(library)

    tags = ["MC", topic]

    export_library(OUTPUT_DIRECTORY, library, topic, tags, LIBRARY_FILENAME)


######################################################################

log_file = None


def init_logging(output_filename):
    global log_file
    try:
        print(f"Logging information to file: {output_filename}")
        if log_file is not None:
            raise Exception("logging already initialized")
        log_file = open(output_filename, "w")
    except Exception as exc:
        print(f"ERROR: failed to initialize logging: {exc}")
        sys.exit(1)


def log(msg):
    global log_file
    try:
        if log_file is None:
            raise Exception("logging not initialized")
        log_file.write(msg + "\n")
    except Exception as exc:
        print(f"ERROR: logging failed for message '{msg}': {exc}")
        sys.exit(1)


def log_and_print(msg):
    log(msg)
    print(msg)


def die(msg):
    log_and_print(msg)
    sys.exit(1)


def log_array(arr, arr_name, dim_names):
    if len(arr.shape) != len(dim_names):
        die(f"log_array length mismatch for {arr_name}")
    log(
        "{} array: ({})".format(
            arr_name,
            ", ".join(
                [f"{dim_names[i]} = {arr.shape[i]}" for i in range(len(arr.shape))]
            ),
        )
    )
    log(np.array_str(arr))


######################################################################


class Struct:
    """Generic structure object."""

    def __init__(self):
        pass


######################################################################


class Library:
    """Data contained in the library.tex file."""

    def __init__(self):
        self.preamble = ""
        self.coverpage = ""
        self.zones = []


class Zone:
    def __init__(self):
        self.body = ""
        self.questions = []


class Question:
    def __init__(self):
        self.variants = []
        self.line_number = None
        self.points = 0
        self.scantron_uses = 0
        self.scantron_answers = 0
        self.scantron_points = 0


class Variant:
    def __init__(self):
        self.body = ""
        self.answers = []
        self.correct_answers = []
        self.incorrect_answers = []
        self.solution = ""
        self.line_number = None
        self.scantron_uses = 0
        self.scantron_answers = 0
        self.scantron_points = 0


class Answer:
    def __init__(self):
        self.body = ""
        self.correct = False
        self.line_number = None
        self.points = 0
        self.scantron_answers = 0


class LibraryRegexp:
    """A regexp for parsing library.tex.

    name is used to specify which rule matched
    regexp is the actual regular expression for the line
    no_tail indicates whether trailing text after the regexp is permitted
    """

    def __init__(self, name, regexp, no_tail=False):
        self.name = name
        self.regexp = regexp
        self.no_tail = no_tail


class ReadState:
    """The current state in the state machine used to parse library.tex.

    name is the state name

    zone, question, variant, and answer are the current objects of the
    relevant type. These are added to as new lines are read from the
    file.
    """

    def __init__(self):
        self.name = "preamble"
        self.zone = Zone()
        self.question = Question()
        self.variant = Variant()
        self.answer = Answer()


######################################################################


def ind2chr(index):
    """c = ind2chr(i)

    Convert the index i to a character c, so that 0 -> 'A', 1 -> 'B',
    etc. Invalid indexes convert to the character '*'.
    """
    index = int(index)
    if index < 0 or index >= len(string.ascii_uppercase):
        return "*"
    return string.ascii_uppercase[index]


def chr2ind(char):
    """i = ind2chr(c)

    Convert the character c to an index i, so that 'A' -> 0, 'B' -> 1,
    etc. Uppercase and lowercase are both converted. Invalid
    characters convert to -1.
    """
    if char in string.ascii_uppercase:
        return string.ascii_uppercase.index(char)
    if char in string.ascii_lowercase:
        return string.ascii_lowercase.index(char)
    return -1


######################################################################


def read_library(input_filename):
    """library = read_library(input_filename)

    Reads the library.tex file and returns a tree of
    Library()/Zone()/Question()/Variant()/Answer() objects.
    """
    log_and_print(f"Reading library file: {input_filename}")
    try:
        input_file = open(input_filename)
    except Exception as exc:
        die(f"ERROR: Unable to open library file for reading: {input_filename}: {exc}")
    library_regexps = [
        LibraryRegexp(
            name="begin_document",
            regexp=r"^\s*\\begin\{document\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(name="zone", regexp=r"^\s*\\zone(?P<tail>.*)$"),
        LibraryRegexp(
            name="question",
            regexp=r"^\s*\\question\{(?P<points>[0-9.]+)\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(name="variant", regexp=r"^\s*\\variant(?P<tail>.*)$"),
        LibraryRegexp(
            name="begin_answers",
            regexp=r"^\s*\\begin\{answers\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(
            name="begin_solution",
            regexp=r"^\s*\\begin\{solution\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(name="answer", regexp=r"^\s*\\answer(?P<tail>.*)$"),
        LibraryRegexp(
            name="correct_answer", regexp=r"^\s*\\correctanswer(?P<tail>.*)$"
        ),
        LibraryRegexp(
            name="end_answers",
            regexp=r"^\s*\\end\{answers\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(
            name="end_solution",
            regexp=r"^\s*\\end\{solution\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(
            name="end_document",
            regexp=r"^\s*\\end\{document\}(?P<tail>.*)$",
            no_tail=True,
        ),
        LibraryRegexp(name="comment", regexp=r"^\s*%.*$"),
        LibraryRegexp(name="text", regexp=r"^.*\S.*$"),
        LibraryRegexp(name="blank", regexp=r"^\s*$"),
    ]
    library = Library()
    state = ReadState()
    for i_line, line in enumerate(input_file):

        def file_log(msg):
            log(f"{input_filename}:{i_line + 1}: {msg}")

        def file_die(msg):
            die(f"{input_filename}:{i_line + 1}: ERROR: {msg}")

        file_log(f'read line: "{line}"')

        match_name = None
        match = None
        for library_regexp in library_regexps:
            match = re.match(library_regexp.regexp, line)
            if match:
                match_name = library_regexp.name
                if library_regexp.no_tail:
                    extra_text = match.group("tail").strip()
                    if len(extra_text) > 0 and extra_text[0] != "%":
                        file_die(
                            f"invalid extra text following '{match_name}': {extra_text}"
                        )
                break
        else:
            file_die("no matches found for line")
        file_log(f"found match '{match_name}'")

        def transition(new_state_name):
            file_log(rf"state transition: '{state.name}' -> '{new_state_name}'")
            state.name = new_state_name

        def bad_transition():
            file_die(f"'{match_name}' not allowed in state '{state.name}'")

        def new_zone():
            file_log("starting new zone")
            state.zone = Zone()
            library.zones.append(state.zone)
            state.zone.line_number = i_line + 1
            state.zone.body = match.group("tail").strip()

        def new_question():
            file_log("starting new question")
            state.question = Question()
            state.zone.questions.append(state.question)
            state.question.line_number = i_line + 1
            try:
                state.question.points = float(match.group("points"))
            except Exception:
                file_die("unable to determine points for question")

        def new_variant():
            file_log("starting new variant")
            state.variant = Variant()
            state.question.variants.append(state.variant)
            state.variant.line_number = i_line + 1
            state.variant.body = match.group("tail").strip()

        def new_answer(correct):
            file_log("starting new answer")
            state.answer = Answer()
            state.variant.answers.append(state.answer)
            state.answer.line_number = i_line + 1
            state.answer.body = match.group("tail").strip()
            state.answer.correct = correct
            if correct:
                state.variant.correct_answers.append(state.answer.body)
            else:
                state.variant.incorrect_answers.append(state.answer.body)
            if len(state.variant.answers) > 5:
                print(f"Too many answers at line {state.answer.line_number}")
                exit(1)

        def append_to_preamble():
            file_log("appending line to preamble")
            library.preamble += line

        def append_to_coverpage():
            file_log("appending line to coverpage")
            library.coverpage += line

        def append_to_zone_body():
            file_log("appending line to zone body")
            state.zone.body += line

        def append_to_variant_body():
            file_log("appending line to variant body")
            state.variant.body += line

        def append_to_answer_body():
            file_log("appending line to answer body")
            state.answer.body += line

        def append_to_solution_body():
            file_log("appending line to solution body")
            state.variant.solution += line

        if state.name == "preamble":
            if match_name == "begin_document":
                transition("coverpage")
            elif match_name == "comment":
                file_log("skipping comment line")
            elif match_name == "text" or match_name == "blank":
                append_to_preamble()
            else:
                bad_transition()
        elif state.name == "coverpage":
            if match_name == "text":
                append_to_coverpage()
            elif match_name == "comment":
                file_log("skipping comment line")
            elif match_name == "blank":
                append_to_coverpage()
            elif match_name == "zone":
                transition("zone")
                new_zone()
            else:
                bad_transition()
        elif state.name == "zone":
            if match_name == "comment":
                file_log("skipping comment line")
            elif match_name == "text" or match_name == "blank":
                append_to_zone_body()
            elif match_name == "question":
                transition("question")
                new_question()
            elif match_name == "zone":
                transition("zone")
                new_zone()
            elif match_name == "end_document":
                file_log("stopping file reading")
                break
            else:
                bad_transition()
        elif state.name == "question":
            if match_name == "variant":
                transition("variant")
                new_variant()
            elif match_name == "question":
                transition("question")
                new_question()
            elif match_name == "zone":
                transition("zone")
                new_zone()
            elif match_name == "end_document":
                file_log("stopping file reading")
                break
            elif match_name == "comment":
                file_log("skipping comment line")
            elif match_name == "blank":
                file_log("skipping blank line")
            else:
                bad_transition()
        elif state.name == "variant":
            if match_name == "comment" or match_name == "text" or match_name == "blank":
                append_to_variant_body()
            elif match_name == "begin_answers":
                transition("answers")
            elif match_name == "begin_solution":
                transition("solution")
            else:
                bad_transition()
        elif state.name == "answers":
            if match_name == "correct_answer":
                transition("answer")
                new_answer(correct=True)
            elif match_name == "answer":
                transition("answer")
                new_answer(correct=False)
            elif match_name == "comment":
                file_log("skipping comment line")
            elif match_name == "blank":
                file_log("skipping blank line")
            else:
                bad_transition()
        elif state.name == "answer":
            if match_name == "comment" or match_name == "text" or match_name == "blank":
                append_to_answer_body()
            elif match_name == "correct_answer":
                transition("answer")
                new_answer(correct=True)
            elif match_name == "answer":
                transition("answer")
                new_answer(correct=False)
            elif match_name == "end_answers":
                transition("presolution")
            else:
                bad_transition()
        elif state.name == "presolution":
            if match_name == "blank":
                pass
            elif match_name == "begin_solution":
                transition("solution")
            else:
                bad_transition()
        elif state.name == "solution":
            if match_name == "text" or match_name == "blank":
                append_to_solution_body()
            elif match_name == "end_solution":
                transition("question")
            else:
                bad_transition()
        else:
            file_die(f"unknown state '{state.name}'")

    input_file.close()
    log("Successfully completed library reading")
    return library


def check_library(library):
    """check_library(library)

    Check that the given Library object is valid, printing errors and
    exiting if any problems are found.
    """
    log_and_print("Checking library data")
    errors = []
    if len(library.zones) == 0:
        errors.append("ERROR: no zones")
    log_and_print("For each question variant listed below, V#-S#-# shows:")
    log_and_print("  variant number - number of answers - correct answer letter")
    total_points = 0
    Qi = 0
    for i_zone, zone in enumerate(library.zones):
        log_and_print(f"Zone {i_zone + 1}: {len(zone.questions)} questions")
        for question in zone.questions:
            variant_infos = []
            if len(question.variants) == 0:
                errors.append(
                    f"question {Qi + 1} (line {question.line_number}): no variants"
                )
            for i_variant, variant in enumerate(question.variants):
                if len(variant.body) == 0:
                    errors.append(
                        f"question {Qi + 1}, variant {i_variant + 1} (line {variant.line_number}): no body text"
                    )
                if len(variant.answers) == 1:
                    errors.append(
                        f"question {Qi + 1}, variant {i_variant + 1} (line {variant.line_number}): only 1 answer"
                    )
                correct_answer_indexes = []
                for i_answer, answer in enumerate(variant.answers):
                    if len(answer.body) == 0:
                        errors.append(
                            f"question {Qi + 1}, variant {i_variant + 1}, answer {i_answer + 1} (line {answer.line_number}): no body text"
                        )
                    if answer.correct:
                        correct_answer_indexes.append(i_answer)
                if len(variant.answers) > 0 and len(correct_answer_indexes) == 0:
                    errors.append(
                        f"question {Qi + 1}, variant {i_variant + 1} (line {variant.line_number}): no correct answer"
                    )
                if len(correct_answer_indexes) > 1:
                    errors.append(
                        f"question {Qi + 1}, variant {i_variant + 1} (line {variant.line_number}): more than one correct answer"
                    )
                if len(variant.answers) > 0:
                    answer_letters = "".join(
                        [ind2chr(i) for i in correct_answer_indexes]
                    )
                else:
                    answer_letters = "*"
                variant_infos.append(
                    f"V{i_variant + 1}-S{len(variant.answers)}-{answer_letters}"
                )
            log_and_print(
                f"    Question {Qi + 1} ({question.points:g} points): {', '.join(variant_infos)}"
            )
            total_points += question.points
            Qi += 1
    if Qi == 0:
        errors.append("no questions in library")
    log_and_print(f"Total points: {total_points:g}")
    if len(errors) > 0:
        for error in errors:
            log_and_print(f"ERROR: {error}")
        die("Errors found during library checking")
    log("Successfully completed library checking")


######################################################################
def mkdirOrDie(dir):
    if not os.path.exists(dir):
        os.makedirs(dir)

    if not os.path.isdir(dir):
        print(f"Could not create directory ({dir})")
        sys.exit(1)


######################################################################
def escapeJsonString(s):
    s = s.replace("\n", "").replace("\[", "$$").replace("\]", "$$")  # Harry modified
    return s.replace("\\", "\\\\").replace('"', '\\"')  # Harry modified


######################################################################
def printJsonKeyValue(out_f, key, value):
    escapedValue = escapeJsonString(value)
    out_f.write(f'"{key}" : "{escapedValue}",\n')


######################################################################
def printJsonKeyValueArray(out_f, key, values):
    out_f.write(f'"{key}" : [')
    needComma = False
    for v in values:
        if needComma:
            out_f.write(",\n")
        needComma = True
        escapedValue = escapeJsonString(v)
        out_f.write(f'"{escapedValue}"')
    out_f.write("],\n")


######################################################################
def export_one_question(
    question_base_directory, qi, question, i_variant, variant, topic, tags
):
    question_name = f"{topic}_q_{qi}"

    if len(question.variants) > 1:
        question_name = f"{question_name}_v{i_variant + 1}"

    question_directory = os.path.join(question_base_directory, question_name)
    clientFilesQuestion_directory = os.path.join(
        question_directory, "clientFilesQuestion"
    )

    mkdirOrDie(question_directory)

    question_json_file = os.path.join(question_directory, "info.json")
    question_html_file = os.path.join(question_directory, "question.html")

    variant_ans = "\n".join(variant.correct_answers)
    uuidString = str(
        uuid.uuid5(
            uuid.NAMESPACE_DNS,
            f"{variant.body}{variant_ans}{qi}",
        )
    )

    text = variant.body.rstrip()
    nofig = text.count("\\begin{center}")
    while nofig > 0:
        mkdirOrDie(clientFilesQuestion_directory)
        start = text.find("\\begin{center}")
        end = text.find("\\end{center}")
        figure_file = os.path.join(clientFilesQuestion_directory, "figure")
        latex_file = figure_file + ".tex"
        with open(latex_file, "w") as latex_f:
            latex_f.write("\\documentclass[11pt]{amsart}\n")
            latex_f.write("\\usepackage{tikz}\n")
            latex_f.write("\\usetikzlibrary{snakes,shapes,arrows,shapes.misc}\n")
            latex_f.write("\\pgfrealjobname{figure}\n")
            latex_f.write("\\begin{document}\n")
            latex_f.write(f"\\beginpgfgraphicnamed{{{question_name}}}")
            latex_f.write(text[start + 14 : end - 1])
            latex_f.write("\n")
            latex_f.write("\\endpgfgraphicnamed\n")
            latex_f.write("\\end{document}\n")
        nofig = nofig - 1
        log_and_print(f"generating figure for question {question_name}")
        os.system(
            "pdflatex -jobname="
            + question_name
            + " -output-directory="
            + clientFilesQuestion_directory
            + " -interaction=nonstopmode"
            + f" {figure_file}"
        )
        figure_file = os.path.join(clientFilesQuestion_directory, question_name)
        os.system(
            "gs -dNOCACHE -q -dNOPAUSE -dBATCH -sDEVICE=pngalpha -r300 -sOutputFile={} {}".format(
                figure_file + ".png", figure_file + ".pdf"
            )
        )
        log_and_print("finished generating figure\n")
        fig_html = f'<p><pl-figure file-name="{question_name}.png"></pl-figure><p>'

        text = text.replace(text[start : end + 13], fig_html)

    with open(question_json_file, "w") as out_f:
        out_f.write("{\n")

        printJsonKeyValue(out_f, "uuid", uuidString)
        printJsonKeyValue(out_f, "title", "Question")
        printJsonKeyValue(out_f, "topic", topic)
        printJsonKeyValueArray(out_f, "tags", tags)
        out_f.write('"type": "v3"\n')
        out_f.write("}")  # end of question object

    with open(question_html_file, "w") as out_f:
        out_f.write("<pl-question-panel>\n")
        out_f.write(text)
        out_f.write("\n</pl-question-panel>\n")

        element = False
        if len(variant.correct_answers) > 1:
            element = "pl-checkbox"
        elif len(variant.correct_answers) == 1:
            element = "pl-multiple-choice"

        if element:
            out_f.write(f'<{element} answers-name="ans">\n')

            for a in variant.answers:
                out_f.write("<pl-answer")
                if a.correct:
                    out_f.write(' correct="true"')
                out_f.write(f">{a.body}</pl-answer>\n")

            out_f.write(f"</{element}>\n")

        if variant.solution:
            out_f.write("\n<pl-answer-panel><br><br>\n")
            out_f.write(variant.solution)
            out_f.write("\n</pl-answer-panel>\n")

    return question_name


def write_qids(OUTPUT_DIRECTORY, topic, qids):
    qid_file = os.path.join(OUTPUT_DIRECTORY, f"{topic}_qids.txt")

    with open(qid_file, "w") as out_f:
        out_f.write('"')
        out_f.write('",\n"'.join(qids))
        out_f.write('"\n')


def export_library(OUTPUT_DIRECTORY, library, topic, tags, LIBRARY_FILENAME):
    log_and_print(f"Exporting to {OUTPUT_DIRECTORY}")
    question_base_directory = os.path.join(OUTPUT_DIRECTORY, "questions")
    mkdirOrDie(question_base_directory)
    qi = 1
    total_points = 0
    qids = []
    for i_zone, zone in enumerate(library.zones):
        log_and_print(f"Zone {i_zone + 1}: {len(zone.questions)} questions")
        for question in zone.questions:
            for i_variant, variant in enumerate(question.variants):
                qids.append(
                    export_one_question(
                        question_base_directory,
                        qi,
                        question,
                        i_variant,
                        variant,
                        topic,
                        tags,
                    )
                )

            total_points += question.points
            qi = qi + 1

    write_qids(OUTPUT_DIRECTORY, topic, qids)
    log_and_print(f"Total points: {total_points:g}")

    log("Successfully exported library")

    # log_and_print("testing latex on %s" % LIBRARY_FILENAME)
    # os.system('pdflatex ' + LIBRARY_FILENAME + " %s" % OUTPUT_DIRECTORY)
    # log_and_print("finished testing latex")


######################################################################

if __name__ == "__main__":
    main()
