from automata.fa.dfa import DFA
from automata.fa.nfa import NFA
from automata.fa.fa import FA
from random import sample
from itertools import chain, product
from typing import Tuple, List, Any, Union, Set, Generator
from typing_extensions import assert_never

LATEX_EPSILON = r"\varepsilon"

def strings_of_length_at_most_n(lower_bound: int, n: int, *, alphabet: Set[str] = {'0', '1'}) -> Generator[str, None, None]:
    return ("".join(char_list) for char_list in chain.from_iterable(
        product(alphabet, repeat=k) for k in range(lower_bound, n + 1)))

def check_dfa(submitted_dfa: DFA,
              reference_dfa: DFA,
              max_length_to_check: int
              ) -> Tuple[List[str], List[str]]:
    """
    Parameters
      - submitted_dfa: DFA submitted by the student
      - reference_dfa: Reference DFA for this problem
      - max_length_to_check: Maximum length to check regex string for feedback
    Return value
      - Return a pair of lists of strings: false_positives, false_negatives
    Exceptions
      - Throw ValueError if input symbols don't match or if DFAs are equivalent
    """

    if submitted_dfa.input_symbols != reference_dfa.input_symbols:
        raise ValueError("Input symbols for submitted DFA don't match reference")

    # Brute Force Check
    false_positives: List[str] = []
    false_negatives: List[str] = []

    for bitstring in strings_of_length_at_most_n(0, max_length_to_check, alphabet=submitted_dfa.input_symbols):
        accepted_by_reference_DFA = reference_dfa.accepts_input(bitstring)
        accepted_by_submitted_DFA = submitted_dfa.accepts_input(bitstring)

        if not accepted_by_reference_DFA and accepted_by_submitted_DFA:
            false_positives.append(bitstring)
        elif accepted_by_reference_DFA and not accepted_by_submitted_DFA:
            false_negatives.append(bitstring)

    if false_positives or false_negatives:
        return false_positives, false_negatives

    # Graph Based Check
    counter = submitted_dfa.find_counterexample(reference_dfa)
    if counter is None:
        raise ValueError("DFAs are equivalent.")
    elif submitted_dfa.accepts_input(counter):
        false_positives.append(counter)
    else:
        false_negatives.append(counter)
    return false_positives, false_negatives


def sample_input_strings(max_input_string_len: int, num_rand_choices: int, fa: FA) -> Tuple[List[str], List[str]]:
    """
    Samples accepted and not accepted input strings for the given fa. Converts
    for display on the frontend.
    """

    # Get all accepted and non-accepted strings of length at most n
    accepted = []
    not_accepted = []

    for x in strings_of_length_at_most_n(1, max_input_string_len, alphabet=fa.input_symbols):
        if fa.accepts_input(x):
            accepted.append(x)
        else:
            not_accepted.append(x)

    # Next, do random sampling based on the number of accepted and rejected strings
    sampled_accepted = []
    sampled_not_accepted = []

    if len(accepted) < (num_rand_choices // 2):
        sampled_accepted = accepted
        sampled_not_accepted = sample(not_accepted, num_rand_choices - len(accepted))

    elif len(not_accepted) < (num_rand_choices // 2 + num_rand_choices % 2):
        sampled_accepted = sample(accepted, num_rand_choices - len(not_accepted))
        sampled_not_accepted = not_accepted

    else:
        sampled_accepted = sample(accepted, num_rand_choices // 2)
        sampled_not_accepted = sample(not_accepted, num_rand_choices // 2 + num_rand_choices % 2)

    # Always include the empty string
    if fa.accepts_input(""):
        sampled_accepted.append(LATEX_EPSILON)
    else:
        sampled_not_accepted.append(LATEX_EPSILON)

    # Return the result
    return sampled_accepted, sampled_not_accepted


def get_equiv_dfa(fsm: Union[DFA, NFA]) -> DFA:
    if isinstance(fsm, NFA):
        return DFA.from_nfa(fsm)
    elif isinstance(fsm, DFA):
        return fsm

    assert_never(fsm)

def generate_dfa_feedback_html(student_equiv_dfa: DFA,
                             reference_equiv_dfa: DFA,
                             max_length_to_check: int,
                             student_input_name: str) -> str:
    """
    Generate feedback html for elements. The 'language' here is defined by
    reference_equiv_dfa.
    """


    def latex_prepare_first_n_list(elements: List[str], n: int) -> str:
        "Format a list of strings for display as HTML"

        def elem_to_latex(elem: str) -> str:
            return elem if elem else LATEX_EPSILON

        string_list = ["<ul>\n"]
        string_list.extend(f"<li>${elem_to_latex(elem)}$</li>\n" for elem in elements[:n])
        string_list.append("</ul>")
        return ''.join(string_list)


    false_positives, false_negatives = \
        check_dfa(student_equiv_dfa, reference_equiv_dfa, max_length_to_check)

    assert false_positives or false_negatives
    feedback_string_list = []

    if false_positives:
        feedback_string_list.append(f"Here are some strings matched by your {student_input_name} which are not in the language:")
        feedback_string_list.append(latex_prepare_first_n_list(false_positives, max_length_to_check))
    if false_negatives:
        feedback_string_list.append(f"Here are some strings in the language which aren't matched by your {student_input_name}:")
        feedback_string_list.append(latex_prepare_first_n_list(false_negatives, max_length_to_check))

    return ''.join(feedback_string_list)
