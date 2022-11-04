import chevron
import json
import lxml.html
import prairielearn as pl

from automata.fa.dfa import DFA
from automata.fa.nfa import NFA
from grading_utils import generate_dfa_feedback_html
import json_utils as ju
from typing import Dict, List, Tuple, Callable, Any, Union, Optional
from typing_extensions import assert_never

ALPHABET_DEFAULT = '01'
EPSILON_SYMBOL = 'e'
MAX_LENGTH_TO_CHECK = 10
WEIGHT_DEFAULT = 1

def prepare(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers-name', 'fsm-type']
    optional_attribs = ['weight', 'alphabet']
    pl.check_attribs(element, required_attribs, optional_attribs)

    name = pl.get_string_attrib(element, 'answers-name')

    fsm_type_name = pl.get_string_attrib(element, 'fsm-type').upper()
    fsm_type = ju.FSMType[fsm_type_name]


    alphabet_list = list(pl.get_string_attrib(element, 'alphabet', ALPHABET_DEFAULT))

    if any(alphabet_element.isspace() for alphabet_element in alphabet_list):
        raise ValueError("Alphabet string contains whitespace.")

    # Parse alphabet string into set
    alphabet = ju.list_as_set(alphabet_list)

    # Initialize dictionary
    data['params'][name] = dict()

    # If element text is present, load for grading
    for child in element:
        if child.tag == 'correct-answer':
            # Record max states
            pl.check_attribs(child, [], ['max-states'])

            if pl.has_attrib(child, 'max-states'):
                data['params'][name]['max_states'] = pl.get_integer_attrib(child, 'max-states')

            # Don't use PL helper function, because we need un-escaped input
            reference_fsm_dict = json.loads(child.text)

            # Serialize so we check for validity, will raise exception if invalid
            if fsm_type is ju.FSMType.DFA:
                ref_dfa = ju.DFA_from_json(reference_fsm_dict)
                assert ref_dfa.input_symbols == alphabet
            elif fsm_type is ju.FSMType.NFA:
                ref_nfa = ju.NFA_from_json(reference_fsm_dict)
                assert ref_nfa.input_symbols == alphabet
            else:
                assert_never(fsm_type)


            data['correct_answers'][name] = json.dumps(reference_fsm_dict)
        else:
            raise ValueError(f"Unsupported child tag name '{child.tag}'")

    # Add epsilon symbol if in NFA mode
    if fsm_type is ju.FSMType.NFA:
        if EPSILON_SYMBOL in alphabet_list:
            raise ValueError(f"Alphabet list {alphabet_list} contains epsilon symbol '{EPSILON_SYMBOL}'")
        alphabet_list.append(EPSILON_SYMBOL)

    # Save parameters to data dict
    data['params'][name]['fsm_type_name'] = fsm_type_name
    data['params'][name]['alphabet_list'] = alphabet_list


def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    fsm_type = ju.FSMType[data['params'][name]['fsm_type_name']]
    alphabet_list = data['params'][name]['alphabet_list']

    editable = data['editable']
    display_dict_name = f'{name}-raw'
    display_json = data['submitted_answers'].get(display_dict_name, None)

    if data['panel'] == 'question':
        html_params = {
            'question': True,
            'answers_name': name,
            'display_json': display_json,
            'alphabet_list': json.dumps(alphabet_list),
            'alphabet_chars': ', '.join(alphabet_list),
            'epsilon_symbol': EPSILON_SYMBOL,
            'format_errors_json': json.dumps(data['format_errors'].get(name, None)),
            'mode_dfa': fsm_type is ju.FSMType.DFA,
            'mode_nfa': fsm_type is ju.FSMType.NFA,
            'fsm_type_name': fsm_type.name,
            'editable': editable,
            'checked': data['submitted_answers'].get(get_checkbox_name(name), None),
            'max_states': data['params'][name].get('max_states', None)
        }

        with open('fsm-builder.mustache', 'r') as f:
            return chevron.render(f, html_params).strip()
    elif data['panel'] == 'submission':
        html_params = {
            'submission': True
        }

        if name in data['format_errors']:
            html_params['parse_errors'] = data['format_errors'][name]

        # If no format errors, get feedback
        elif name in data['partial_scores']:
            html_params['feedback'] = data['partial_scores'][name].get('feedback', None)

        with open('fsm-builder.mustache', 'r') as f:
            return chevron.render(f, html_params).strip()

    # Nothing interesting to display in correct answer panel, should just hide
    elif data['panel'] == 'answer':
        return ''

    assert_never(data['panel'])


def parse(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')
    fsm_json = json.loads(data['raw_submitted_answers'][name + '-raw'])

    checkbox_name = get_checkbox_name(name)
    data['submitted_answers'][checkbox_name] = data['raw_submitted_answers'].get(checkbox_name, 'off') == 'on'

    # Get FSM info from raw dict
    states = []
    final_states = []
    for node in fsm_json['nodes']:
        states.append(node['text'])
        if node['isAcceptState']:
            final_states.append(node['text'])

    transitions: Dict[str, Dict[str, List[str]]] = {state: dict() for state in states}
    initial_states = []

    for link in fsm_json['links']:
        if link['type'] == 'StartLink':
            node = states[link['node']]
            initial_states.append(node)

        if link['type'] == 'SelfLink':
            node = states[link['node']]

            for char in link['text'].split(','):
                transitions[node].setdefault(char, []).append(node)

        if link['type'] == 'Link':
            start_node = states[link['nodeA']]
            end_node = states[link['nodeB']]

            for char in link['text'].split(','):
                transitions[start_node].setdefault(char, []).append(end_node)

    data['submitted_answers'][name] = json.dumps({
        'states': states,
        'input_symbols': data['params'][name]['alphabet_list'],
        'transitions': transitions,
        'initial_state': initial_states,
        'final_states': final_states,
        'include_dump_state': data['submitted_answers'][checkbox_name],
        'epsilon_symbol': EPSILON_SYMBOL
    })


def grade(element_html: str, data: pl.QuestionData) -> None:
    element = lxml.html.fragment_fromstring(element_html)

    weight = pl.get_integer_attrib(element, 'weight', WEIGHT_DEFAULT)
    name = pl.get_string_attrib(element, 'answers-name')

    fsm_json = json.loads(data['submitted_answers'][name])
    fsm_type = ju.FSMType[data['params'][name]['fsm_type_name']]

    dump_state: bool = data['submitted_answers'].get(get_checkbox_name(name), False)
    data['format_errors'].pop(name, None)

    # Serialize inputted FSM into the submitted answers dict
    try:
        if fsm_type is ju.FSMType.DFA:
            data['submitted_answers'][name] = json.dumps(ju.dfa_convert_json(fsm_json, dump_state))
        elif fsm_type is ju.FSMType.NFA:
            data['submitted_answers'][name] = json.dumps(ju.nfa_convert_json(fsm_json))
        else:
            assert_never(fsm_type)
    except ju.JsonValidationException as err:
        # String for highlighting
        json_transitions = [
            {'startState': start_state, 'char': char, 'endState': end_state}
            for (start_state, char, end_state) in sorted(err.transitions)
        ] if err.transitions else None

        json_states = [
            {'name': state} for state in sorted(err.states)
        ] if err.states else None

        display_states = json_states is not None
        display_transitions = json_transitions is not None

        # If both set, only display transitions
        if display_states and display_transitions:
            display_states = False

        data['format_errors'][name] = {
            'message': err.message,
            'stateNames': json_states,
            'transitions': json_transitions,
            'displayStates': display_states,
            'displayTransitions': display_transitions
        }

    # If we were given a reference solution, grade against that
    if name in data['correct_answers'] and name not in data['format_errors']:
        rerference_json_string = data['correct_answers'][name]
        max_states = data['params'][name].get('max_states')

        def get_grading_info(fsm_json_string: str) -> Tuple[DFA, int]:
            fsm_json_dict = json.loads(fsm_json_string)

            if fsm_type is ju.FSMType.DFA:
                dfa = ju.DFA_from_json(fsm_json_dict)
                return dfa, len(dfa.states)
            elif fsm_type is ju.FSMType.NFA:
                nfa = ju.NFA_from_json(fsm_json_dict)
                return DFA.from_nfa(nfa), len(nfa.states)
            else:
                assert_never(fsm_type)

        def grade_fsm(fsm_json_string: str) -> Tuple[float, str]:
            student_equiv_dfa, num_states = get_grading_info(fsm_json_string)
            correct_equiv_dfa, _ = get_grading_info(rerference_json_string)

            if student_equiv_dfa == correct_equiv_dfa:
                if max_states is not None and num_states > max_states:
                    feedback_str = (
                        f"Your {fsm_type.name} matches the desired language, but "
                        f"has {num_states} {get_states_plural(num_states)}. "
                        f"It can have at most {max_states} {get_states_plural(max_states)} "
                        "to receive full credit.<br>"
                    )
                    return (0.5, feedback_str)

                return (1.0, f"Your {fsm_type.name} matches the desired language!")

            feedback_html = generate_dfa_feedback_html(student_equiv_dfa, correct_equiv_dfa, MAX_LENGTH_TO_CHECK, fsm_type.name)

            if max_states is not None and num_states > max_states:
                feedback_str = (
                    f"Your {fsm_type.name} does not match the desired language "
                    f"and has {num_states} {get_states_plural(num_states)}{print_dump_state(fsm_type, num_states, dump_state)}. "
                    "It must match the desired language and can have at most "
                    f"{max_states} {get_states_plural(max_states)} to receive full credit.<br>"
                )

                return (0.0, feedback_str + feedback_html)

            feedback_str = f"Your {fsm_type.name} does not match the desired language.<br>"
            return (0.0, feedback_str + feedback_html)

        grade_question_parameterized(data, name, grade_fsm, weight=weight)


def get_checkbox_name(name: str) -> str:
    return f'{name}-include-dump-state'


def get_states_plural(num_states: int) -> str:
    return 'state' if num_states == 1 else 'states'

def print_dump_state(fsm_type: ju.FSMType, num_states: int, dump_state: bool) -> str:
    if fsm_type is ju.FSMType.NFA and dump_state:
        return f' ({num_states-1} {get_states_plural(num_states-1)}, plus one dump state)'
    return ''

def grade_question_parameterized(data: pl.QuestionData,
                                 question_name: str,
                                 grade_function: Callable[[Any], Tuple[Union[bool, float], Optional[str]]],
                                 weight: int = 1,
                                 feedback_field_name: Optional[str] = None) -> None:
    '''
    Grade question question_name, marked correct if grade_function(student_answer) returns True in
    its first argument. grade_function should take in a single parameter (which will be the submitted
    answer) and return a 2-tuple.
        - The first element of the 2-tuple should either be:
            - a boolean indicating whether the question should be marked correct
            - a partial score between 0 and 1, inclusive
        - The second element of the 2-tuple should either be:
            - a string containing feedback
            - None, if there is no feedback (usually this should only occur if the answer is correct)

    Note: if the feedback_field_name is the same as the question name,
    then the feedback_field_name does not need to be specified.
    '''

    # Create the data dictionary at first
    data['partial_scores'][question_name] = {
            'score': 0.0,
            'weight': weight
    }

    try:
        submitted_answer = data['submitted_answers'][question_name]
    except KeyError:
        # Catch error if no answer submitted
        data["format_errors"][question_name] = 'No answer was submitted'
        return

    # Try to grade, exiting if there's an exception
    try:
        result, feedback_content = grade_function(submitted_answer)

        # Check _must_ be done in this order. Int check is to deal with subclass issues
        if isinstance(result, bool):
            partial_score = 1.0 if result else 0.0
        elif isinstance(result, (float, int)):
            assert 0.0 <= result <= 1.0
            partial_score = result
        else:
            assert_never(result)

    except ValueError as err:
        # Exit if there's a format error
        data["format_errors"][question_name] = html.escape(str(err))
        return


    # Set question score if grading succeeded
    data['partial_scores'][question_name]['score'] = partial_score

    # Put all feedback here
    if feedback_content:
        # Check for unescaped bad stuff in feedback string
        if isinstance(submitted_answer, str):
            contains_bad_chars = all(x in submitted_answer for x in {'<', '>'})
            if contains_bad_chars and submitted_answer in feedback_content:
                raise ValueError(f'Unescaped student input should not be present in the feedback for {question_name}.')

        data['partial_scores'][question_name]['feedback'] = feedback_content

        if not feedback_field_name:
            feedback_field_name = question_name

        data['feedback'][feedback_field_name] = feedback_content
