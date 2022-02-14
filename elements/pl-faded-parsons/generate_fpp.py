from typing import *

from collections import defaultdict, namedtuple
from json import dumps, loads
from os import path, PathLike
from re import finditer, match as test
from shutil import copyfile
from uuid import uuid4
from functools import partial

from lib.generate_test import make_test_file
from lib.consts import MAIN_PATTERN, SPECIAL_COMMENT_PATTERN, \
    BLANK_SUBSTITUTE, SETUP_CODE_DEFAULT, TEST_DEFAULT, REGION_IMPORT_PATTERN
from lib.name_visitor import generate_server, AnnotatedName
from lib.io_helpers import Bcolors, resolve_path, file_name, \
    make_if_absent, write_to, file_ext, Namespace, parse_args, \
    auto_detect_sources, read_region_source_lines


def extract_regions(
        source_code: str, *,
        keep_comments_in_prompt: bool = False,
        source_path: str = None) -> dict[str, str]:
    """ Extracts from well-formatted `source_code` string the text for the question, 
        the problem starting code, the answer code, and any other custom regions

        Formatting rules:
        - If the file begins with a docstring, it will become the `question_text` region
            - The question text is removed from the answer
            - Docstrings are always removed from the prompt
        - Text surrounded by `?`s will become blanks in the prompt
            - Blanks cannot span more than a single line
            - The text within the question marks fills the blank in the answer
            - `?`s in any kind of string-literal or comment are ignored
        - Comments are removed from the prompt *unless*
            - `keep_comments_in_prompt = True` OR
            - The comment is of the form `#{n}given` or `#blank`, 
              which are the only comments removed from the answer
        - Custom regions are begun and ended by `## {region name} ##`
            - A maximum of one region may be open at a time
            - All text in a region is only copied into that region
            - Regions must be closed before the end of the source string
            - Text will be copied into a new file with the regions name in the
            question directory, excluding these special regions:
                explicit: `test` `setup_code`
                implicit: `answer_code` `prompt_code` `question_text`
            - Code in `setup_code` will be parsed to extract exposed names unless the --no-parse
            flag is set. Type annotations and function docstrings are used to fill out server.py
            - Any custom region that clashes with an automatically generated file name
            will overwrite the automatically generated code
        - Import regions allow for the contents of arbitrary files to be loaded as regions
            - They are formatted as `## import {rel_file_path} as {region name} ##`
                where `rel_file_path` is the relative path to the file from the source file
            - Like regular regions, they cannot be used inside of another region


        e.g.
        ```
        > source = "sum = lambda a, b: ?a + b? #0given"
        > extract_regions(source)
        {'prompt_code': "sum = lambda a, b: !BLANK #0given", 'answer_code': "sum = lambda a, b: a + b"}

        > source = "\\\"\\\"\\\"Make good?\\\"\\\"\\\" ?del bad?  # badness?!?"
        > extract_regions(source)
        {'question_text': "Make good?", 'prompt_code': "!BLANK", 'answer_code': "del bad  # badness?!?!"}
        ```
    """
    # (exclusive) end of the last match
    last_end = 0
    first_match = True

    RegionToken = namedtuple('RegionToken', ['line', 'id'])
    current_region: RegionToken = None

    format_line = partial('({}:{})'.format, source_path or 'line')

    # accumulators
    line_number = 1
    regions = defaultdict(str)

    for match in finditer(MAIN_PATTERN, source_code):
        start, end = match.span()

        # make sure to keep un-captured text between matches
        # (if no un-captured text exists, unmatched = '')
        unmatched = source_code[last_end:start]
        if current_region:
            regions[current_region.id] += unmatched
        else:
            regions['prompt_code'] += unmatched
            regions['answer_code'] += unmatched

        # keep the line number updated
        line_number += sum(1 for x in unmatched if x == '\n')

        last_end = end

        # only one of these is ever non-None
        region_delim, comment, docstring, string, blank_ans = match.groups()

        if region_delim is not None:
            if not len(region_delim):
                raise SyntaxError(
                    "Regions must be named (ie ## test ##) " + format_line(line_number))
            if current_region:
                if region_delim != current_region.id:
                    raise SyntaxError(
                        "Region \"{}\" began {} before \"{}\" ended {}".format(
                            region_delim,
                            format_line(current_region.line),
                            current_region.id,
                            format_line(line_number + 1))
                    )
                else:
                    current_region = None
            else:
                import_region = test(REGION_IMPORT_PATTERN, region_delim)
                if import_region:
                    region_source, alias = import_region.groups()
                    try:
                        regions[alias] += read_region_source_lines(
                            source_path, region_source)
                    except FileNotFoundError:
                        raise FileNotFoundError(
                            "Region \"{}\" failed on import. Could not find {} at {}".format(
                                alias, region_source, format_line(line_number)))
                    except OSError as e:
                        raise OSError(
                            "Region \"{}\" failed on import. Could not read {}:\n\t\t{}\n\tat {}".format(
                                alias, region_source, e.strerror, format_line(line_number)))
                else:
                    current_region = RegionToken(line_number + 1, region_delim)
        elif current_region:
            regions[current_region.id] += next(filter(bool, match.groups()))
        elif comment:
            special_comment = test(SPECIAL_COMMENT_PATTERN, comment)

            if not special_comment:
                regions['answer_code'] += comment

            if special_comment or keep_comments_in_prompt:
                # even if excluding the comment from the prompt,
                # every comment ends with a '\n'.
                # must keep it to maintain whitespacing
                regions['prompt_code'] += comment
        elif docstring:
            if first_match:
                # isolate the question doc and save it
                regions['question_text'] += docstring[3:-3]
            else:
                # docstrings cannot be included in current FPP
                # regions['prompt_code'] += docstring
                regions['answer_code'] += docstring
        elif string:
            # strings always stay in both
            regions['prompt_code'] += string
            regions['answer_code'] += string
        elif blank_ans:
            # fill in proper blank text
            regions['prompt_code'] += BLANK_SUBSTITUTE
            regions['answer_code'] += blank_ans
        else:
            raise Exception('All capture groups are None after', last_end)

        # keep track of any \n in the matched part of the string
        # (namely for docstrings or region delimiters)
        line_number += sum(1 for x in source_code[start:end] if x == '\n')
        first_match = False

    # all region delimiters should've been detected.
    # if there's a current region, it'll never be closed
    if current_region:
        raise SyntaxError("File ended before \"{}\" {} ended".format(
            current_region.id, format_line(current_region.line)))

    # don't forget everything after the last match!
    unmatched = source_code[last_end:]
    regions['prompt_code'] += unmatched
    regions['answer_code'] += unmatched

    # remove all whitespace-only lines
    # usually as a result of removing comments
    # then remove trailing ws
    regions['prompt_code'] = '\n'.join(
        filter(bool, map(str.rstrip, regions['prompt_code'].splitlines())))
    # remove trailing ws on each line,
    # then remove trailing ws
    regions['answer_code'] = '\n'.join(
        map(str.rstrip, regions['answer_code'].splitlines())
    ).lstrip()

    return regions


def generate_question_html(
    prompt_code: str, *,
    question_text: str = None,
    tab: str = '  ',
    setup_names: list[AnnotatedName] = None,
    answer_names: list[AnnotatedName] = None
) -> str:
    """Turn an extracted prompt string into a question html file body"""
    indented = prompt_code.replace('\n', '\n' + tab)

    if question_text is None:
        question_text = tab + '<!-- Write the question prompt here -->'
    elif setup_names or answer_names:
        question_text = tab + '<h3> Prompt </h3>\n' + tab + question_text

        question_text += '\n\n<markdown>\n'

        def format_annotated_name(name: AnnotatedName) -> str:
            out = ' - `' + name.id
            if name.annotation:
                out += ': ' + name.annotation
            out += '`'
            if name.description:
                out += ', ' + name.description
            return out

        if setup_names:
            question_text += '### Provided\n'
            question_text += '\n'.join(map(format_annotated_name, setup_names))
            if answer_names:
                question_text += '\n\n'

        if answer_names:
            question_text += '### Required\n'
            question_text += '\n'.join(
                map(format_annotated_name, answer_names))

        question_text += '\n</markdown>\n'

    return """<!-- AUTO-GENERATED FILE -->
<pl-question-panel>
{question_text}
</pl-question-panel>

<!-- see README for where the various parts of question live -->
<pl-faded-parsons>
{tab}{indented}
</pl-faded-parsons>""".format(question_text=question_text, tab=tab, indented=indented)


def generate_info_json(question_name: str, *, indent=4) -> str:
    """ Creates the default info.json for a new FPP question, with a unique v4 UUID.
        Expects `question_name` to be lower snake case.
    """
    question_title = ' '.join(l.capitalize() for l in question_name.split('_'))

    info_json = {
        'uuid': str(uuid4()),
        'title': question_title,
        'topic': '',
        'tags': ['berkeley', 'fp'],
        'type': 'v3',
        'gradingMethod': 'External',
        'externalGradingOptions': {
            'enabled': True,
            'image': 'prairielearn/grader-python',
            'entrypoint': '/python_autograder/run.sh',
            'timeout': 5
        }
    }

    return dumps(info_json, indent=indent) + '\n'

def try_generate_test_file(test_data: str) -> Tuple[bool, str]:
    try:
        json = loads(test_data)
    except Exception as e:
        return False, test_data
    
    return True, make_test_file(json)
    
def generate_fpp_question(
    source_path: PathLike[AnyStr], *,
    force_generate_json: bool = False,
    no_parse: bool = False,
    log_details: bool = True,
    show_required: bool = False
):
    """ Takes a path of a well-formatted source (see `extract_prompt_ans`),
        then generates and populates a question directory of the same name.
    """
    Bcolors.info('Generating from source', source_path)

    source_path = resolve_path(source_path)

    if log_details:
        print('- Extracting from source...')

    with open(source_path, 'r') as source:
        source_code = ''.join(source)
        regions = extract_regions(source_code, source_path=source_path)

    def remove_region(key, default=''):
        if key in regions:
            v = regions[key]
            del regions[key]
            return v
        return default

    question_name = file_name(source_path)

    # create all new content in a new folder that is a
    # sibling of the source file in the filesystem
    question_dir = path.join(path.dirname(source_path), question_name)

    if log_details:
        print('- Creating destination directories...')

    test_dir = path.join(question_dir, 'tests')
    make_if_absent(test_dir)

    copy_dest_path = path.join(question_dir, 'source.py')
    if log_details:
        print('- Copying {} to {} ...'.format(path.basename(source_path), copy_dest_path))
    copyfile(source_path, copy_dest_path)

    if log_details:
        print('- Populating {} ...'.format(question_dir))

    setup_code = remove_region('setup_code', SETUP_CODE_DEFAULT)
    answer_code = remove_region('answer_code')

    server_code = remove_region('server')
    gen_server_code, setup_names, answer_names = generate_server(
        setup_code, answer_code, no_ast=no_parse)
    server_code = server_code or gen_server_code

    prompt_code = remove_region('prompt_code')
    question_text = remove_region('question_text')

    question_html = generate_question_html(
        prompt_code,
        question_text=question_text,
        setup_names=setup_names,
        answer_names=answer_names if show_required else None
    )

    write_to(question_dir, 'question.html', question_html)

    json_path = path.join(question_dir, 'info.json')
    json_region = remove_region('info.json')
    missing_json = not path.exists(json_path)
    if force_generate_json or json_region or missing_json:
        json_text = json_region or generate_info_json(question_name)
        write_to(question_dir, 'info.json', json_text)
        if not missing_json:
            Bcolors.warn('  - Overwriting', json_path,
                         'using \"info.json\" region...' if json_region else '...')

    write_to(question_dir, 'server.py', server_code)

    if log_details:
        print('- Populating {} ...'.format(test_dir))

    write_to(test_dir, 'ans.py', answer_code)

    write_to(test_dir, 'setup_code.py', setup_code)

    test_region = remove_region('test', TEST_DEFAULT)

    try:
        success, test_file = try_generate_test_file(test_region)
        if success and log_details:
            Bcolors.info('  - Generating tests/test.py from json test region')
            write_to(test_dir, 'test_source.json', test_region)
    except SyntaxError as e:
        if log_details:
            Bcolors.fail('    * Generating tests from json failed with error:', e.msg)
            Bcolors.warn('    - Recovering by using test region as python file')
        test_file = test_region
    
    write_to(test_dir, 'test.py', test_file)

    if regions:
        Bcolors.warn('- Writing unrecognized regions:')

    for raw_path, data in regions.items():
        if not raw_path:
            Bcolors.warn('  - Skipping anonymous region!')
            continue

        # if no file extension is given, give it .py
        if not file_ext(raw_path):
            raw_path += '.py'

        # ensure that the directories exist before writing
        final_path = path.join(question_dir, raw_path)
        make_if_absent(path.dirname(final_path))
        Bcolors.warn('  -', final_path, '...')

        # write files
        write_to(question_dir, raw_path, data)

    Bcolors.printf(Bcolors.OK_GREEN, 'Done.')


def generate_many(args: Namespace):
    if not args.source_paths:
        args.source_paths = auto_detect_sources()

    def generate_one(source_path, force_json=False):
        try:
            generate_fpp_question(
                source_path,
                force_generate_json=force_json,
                no_parse=args.no_parse,
                log_details=not args.quiet
            )
            return True
        except SyntaxError as e:
            Bcolors.fail('SyntaxError:', e.msg)
        except OSError as e:
            Bcolors.fail('FileNotFoundError:', *e.args)

        return False

    successes, failures = 0, 0

    for source_path in args.source_paths:
        if generate_one(source_path):
            successes += 1
        else:
            failures += 1

    for source_path in args.force_json:
        if generate_one(source_path, force_json=True):
            successes += 1
        else:
            failures += 1

    # print batch feedback
    if successes + failures > 1:
        def n_files(n): return str(n) + ' file' + ('' if n == 1 else 's')
        if successes:
            Bcolors.ok('Batch completed successfully on', n_files(successes), end='')
            if failures:
                Bcolors.fail(' and failed on', n_files(failures))
            else:
                print()
        else:
            Bcolors.fail('Batch failed on all', n_files(failures))


def profile_generate_many(args: Namespace):
    from cProfile import Profile
    from pstats import Stats, SortKey

    with Profile() as pr:
        generate_many(args)

    stats = Stats(pr)
    stats.sort_stats(SortKey.TIME)
    print('\n---------------\n')
    stats.print_stats()


def main():
    args = parse_args()

    if args.profile:
        profile_generate_many(args)
    else:
        generate_many(args)


if __name__ == '__main__':
    main()
