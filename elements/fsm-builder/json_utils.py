"""Functions for error checking in converting JSON to FSMs"""


from enum import Enum
from dataclasses import dataclass
from automata.fa.dfa import DFA#, DFAJsonDict
from automata.fa.nfa import NFA#, NFAJsonDict
from typing import Dict, List, Tuple, Optional, Set, Union, TypedDict, Any, TypeVar, Callable

import copy

FSMRawJsonStateT = str
FSMRawTransitionT = Dict[FSMRawJsonStateT, Dict[str, List[FSMRawJsonStateT]]]

ErrorStatesT = Optional[Set[str]]

StartTupleT = Tuple[None, None, str]
TransitionTupleT = Tuple[str, str, str]
MissingTransitionTupleT = Tuple[str, str, None]

ErrorTransitionsT = Optional[Union[Set[StartTupleT], Set[TransitionTupleT], Set[MissingTransitionTupleT]]]


class FSMRawJsonDict(TypedDict):
    input_symbols: List[str]
    states: List[FSMRawJsonStateT]
    transitions: FSMRawTransitionT
    initial_state: List[FSMRawJsonStateT]
    final_states: List[FSMRawJsonStateT]
    epsilon_symbol: str

DFAStateT = Any
DFAPathT = Dict[str, DFAStateT]
DFATransitionsT = Dict[DFAStateT, DFAPathT]

class DFAJsonDict(TypedDict):
    "A class with type signatures for the dfa json dict"
    states: List[DFAStateT]
    input_symbols: List[str]
    transitions: DFATransitionsT
    initial_state: DFAStateT
    final_states: List[DFAStateT]

NFAStateT = Any
NFAPathT = Dict[str, Set[NFAStateT]]
NFATransitionsT = Dict[NFAStateT, NFAPathT]

class NFAJsonDict(TypedDict):
    "A class with type signatures for the nfa json dict"
    states: List[NFAStateT]
    input_symbols: List[str]
    transitions: Dict[NFAStateT, Dict[str, List[NFAStateT]]]
    initial_state: NFAStateT
    final_states: List[NFAStateT]


class FSMType(Enum):
    DFA = 1
    NFA = 2


@dataclass
class JsonValidationException(Exception):
    """An exception raised for issues in Json validation."""
    states: ErrorStatesT
    transitions: ErrorTransitionsT
    message: str


def convert_states_for_json(states_list: List[FSMRawJsonStateT]) -> List[FSMRawJsonStateT]:
    """
    Check for duplicate states.
    """
    states = set()
    duplicated_names = set()
    for state in states_list:
        if state == "":
            raise JsonValidationException({state}, None, "Some states are missing a name.")
        elif state in states:
            duplicated_names.add(state)
        else:
            states.add(state)

    if duplicated_names:
        raise JsonValidationException(duplicated_names, None, "Duplicate state names:")

    return list(states)


def convert_initial_state_for_json(initial_state: List[FSMRawJsonStateT]) -> FSMRawJsonStateT:
    """
    Check there is only one initial state.
    """
    if len(initial_state) == 0:
        raise JsonValidationException(None, None, "Your FSM is missing a start state.")
    elif len(initial_state) > 1:
        transitions = {(None, None, state) for state in initial_state}
        raise JsonValidationException(set(initial_state), transitions, "Multiple states marked as start states:")

    return initial_state[0]


def check_final_states_for_json(final_states: List[FSMRawJsonStateT]) -> None:
    """
    Check that final states are nonempty.
    """
    if (len(final_states) == 0):
        raise JsonValidationException(None, None, 'You must have at least one accepting state.')


def check_transitions_invalid_characters_for_json(
        transitions: FSMRawTransitionT,
        input_symbols: Set[str]) -> None:
    """
    Check for transitions on invalid characters.
    """
    invalid_transitions = set()
    for start_state, transition in transitions.items():
        for char, end_states in transition.items():
            for end_state in end_states:

                if char not in input_symbols:
                    invalid_transitions.add((start_state, char, end_state))

    if invalid_transitions:
        raise JsonValidationException(None, invalid_transitions, "Transitions on invalid characters:")


def check_transitions_missed_characters_for_json(
        transitions: FSMRawTransitionT,
        input_symbols: Set[str],
        dump_state_tuple: Optional[Tuple[FSMRawJsonStateT, List[FSMRawJsonStateT]]],
        epsilon_symbol: Optional[str]) -> None:
    """
    Check that transitioning on characters is never missed. If there is an
    included dump state, then instead add transitions to the dump state.
    """
    missing_transitions = set()
    for start_state, transition in transitions.items():
        output_chars = set(transition.keys())
        missing_chars = input_symbols.difference(output_chars)

        # Epsilon symbol is never needed
        if epsilon_symbol:
            missing_chars.discard(epsilon_symbol)

        if missing_chars:
            for missing_char in missing_chars:
                missing_transitions.add((start_state, missing_char))

    if missing_transitions:
        if dump_state_tuple is None:
            # If no dump state, then raise an exception based on the missing transitions
            missed_states = {
                state for state, _ in missing_transitions
            }

            missing_transitions_display = {
                (state, char, None) for state, char in missing_transitions
            }

            raise JsonValidationException(missed_states, missing_transitions_display,
                "States missing outgoing transitions:")

        else:
            dump_state, states = dump_state_tuple
            # If dump state allowed, add it to the DFA
            states.append(dump_state)

            # If a dump state is marked, then make missing transitions go there
            for start_state, char in missing_transitions:
                transitions[start_state][char] = [dump_state]

            # Then, make the dump state transition nowhere
            transitions[dump_state] = {
                char: [dump_state]
                for char in input_symbols
            }


def check_transitions_duplicate_characters_for_json(transitions: FSMRawTransitionT) -> None:
    """
    Check that there are no character duplicate transitions. Only needed for DFAs.
    """
    duplicate_transitions = set()
    for start_state, transition in transitions.items():
        for char, end_states in transition.items():
            if len(end_states) > 1:
                for end_state in end_states:
                    duplicate_transitions.add((start_state, char, end_state))

    if duplicate_transitions:
        raise JsonValidationException(None, duplicate_transitions,
            "Multiple transitions on the same character coming out of some states:")


def check_transitions_redundant_for_json(transitions: FSMRawTransitionT) -> None:
    """
    Check that there are no identical transitions. Only needed for NFAs. This
    is a less stringent check than check_transitions_duplicate_characters_for_json
    """
    transition_set = set()
    redundant_transitions = set()
    for start_state, transition in transitions.items():
        for char, end_states in transition.items():
            for end_state in end_states:
                transition_tuple = (start_state, char, end_state)

                if transition_tuple in transition_set:
                    redundant_transitions.add(transition_tuple)

                else:
                    transition_set.add(transition_tuple)

    if redundant_transitions:
        raise JsonValidationException(None, redundant_transitions, "Identical transitions present:")


def check_for_unreachable_states(fa: Union[DFA, NFA], dump_state_name: Optional[str]) -> None:
    unreachable_states = fa.states - fa._compute_reachable_states()

    if dump_state_name:
        unreachable_states.discard(dump_state_name)

    if len(unreachable_states) > 0:
        raise JsonValidationException(unreachable_states, None, "Unreachable states present:")


def dfa_convert_json(dfa_dict: FSMRawJsonDict, dump_state: bool) -> DFAJsonDict:
    """
    Convert raw json dict for serialization as a DFA. Raise an exception if
    the input JSON defines an invalid DFA.
    """
    # Load inital alphabet
    input_symbols_set = list_as_set(dfa_dict['input_symbols'])

    states = convert_states_for_json(dfa_dict['states'])

    initial_state = convert_initial_state_for_json(dfa_dict['initial_state'])

    # Finally, the transition dictionary is one-to-one with the automata constructor.
    transitions = copy.deepcopy(dfa_dict['transitions'])
    check_transitions_invalid_characters_for_json(transitions, input_symbols_set)
    check_transitions_duplicate_characters_for_json(transitions)

    dump_state_name = None

    if dump_state:
        # If dump state is marked, add it to the states set and then do the transition check
        dump_state_num = 1

        while str(dump_state_num) in states:
            dump_state_num += 1

        # Make sure dump state is a string, otherwise causes weird issues
        dump_state_name = str(dump_state_num)
        check_transitions_missed_characters_for_json(transitions, input_symbols_set, (dump_state_name, states), None)

    else:
        # If dump state is not marked, check as normal
        check_transitions_missed_characters_for_json(transitions, input_symbols_set, None, None)

    transformed_transitions = {
        start_state: {
            char: end_states[0]
            for char, end_states in transition.items()
        }
        for start_state, transition in transitions.items()
    }

    input_symbols = list(input_symbols_set)

    final_states = dfa_dict['final_states']
    check_final_states_for_json(final_states)

    dfa_json_dict: DFAJsonDict = {
        'states': states,
        'input_symbols': input_symbols,
        'transitions': transformed_transitions,
        'initial_state': initial_state,
        'final_states': final_states
    }

    check_for_unreachable_states(DFA_from_json(dfa_json_dict), dump_state_name)

    return dfa_json_dict


def nfa_convert_json(nfa_dict: FSMRawJsonDict) -> NFAJsonDict:
    """
    Convert raw json dict for serialization as a NFA. Raise an exception if
    the input JSON defines an invalid NFA.
    """
    # Load inital alphabet
    input_symbols_set = list_as_set(nfa_dict['input_symbols'])

    states = convert_states_for_json(nfa_dict['states'])

    initial_state = convert_initial_state_for_json(nfa_dict['initial_state'])

    # Finally, the transition dictionary is one-to-one with the automata constructor.
    transitions = copy.deepcopy(nfa_dict['transitions'])
    check_transitions_invalid_characters_for_json(transitions, input_symbols_set)
    check_transitions_redundant_for_json(transitions)

    epsilon_symbol = nfa_dict['epsilon_symbol']

    # Replace epsilon transitions
    for transition in transitions.values():
        if epsilon_symbol in transition:
            transition[''] = transition.pop(epsilon_symbol)

    input_symbols = list(input_symbols_set)
    input_symbols.remove(epsilon_symbol)

    final_states = nfa_dict['final_states']
    check_final_states_for_json(final_states)

    nfa_json_dict: NFAJsonDict = {
        'states': states,
        'input_symbols': input_symbols,
        'transitions': transitions,
        'initial_state': initial_state,
        'final_states': final_states
    }

    check_for_unreachable_states(NFA_from_json(nfa_json_dict), None)

    return nfa_json_dict


T = TypeVar('T')

def list_as_set(elem_list: List[T]) -> Set[T]:
    """
    Transforms a list to a set, raising an exception if the input has duplicates.
    """
    elem_set = set(elem_list)

    if len(elem_set) != len(elem_list):
        raise ValueError(f"Input list {str(elem_list)} has duplicates.")

    return elem_set


def NFA_from_json(json_nfa: NFAJsonDict) -> NFA:
    states = list_as_set(json_nfa['states'])
    input_symbols = list_as_set(json_nfa['input_symbols'])

    # Check for no duplicate states
    json_transitions = json_nfa['transitions']
    transitions: NFATransitionsT = dict()

    for start_state, transition in json_transitions.items():
        transitions[start_state] = {
            char: list_as_set(end_states)
            for char, end_states in transition.items()
        }

    initial_state = json_nfa['initial_state']
    final_states = list_as_set(json_nfa['final_states'])
    return NFA(states=states, input_symbols=input_symbols, transitions=transitions,
                initial_state=initial_state, final_states=final_states)


def NFA_to_json(self) -> NFAJsonDict:
    json_states = sorted(self.states, key=str)
    json_input_symbols = sorted(self.input_symbols)

    json_transitions = {
        start_state: {
            char: sorted(end_states, key=str)
            for char, end_states in transition.items()
        }
        for start_state, transition in self.transitions.items()
    }

    json_initial_state = self.initial_state
    json_final_states = sorted(self.final_states, key=str)
    return {
        'states': json_states,
        'input_symbols': json_input_symbols,
        'transitions': json_transitions,
        'initial_state': json_initial_state,
        'final_states': json_final_states
    }

def DFA_from_json(jsonDFA: DFAJsonDict) -> DFA:
    states = list_as_set(jsonDFA['states'])
    input_symbols = list_as_set(jsonDFA['input_symbols'])
    transitions = jsonDFA['transitions']
    initial_state = jsonDFA['initial_state']
    final_states = list_as_set(jsonDFA['final_states'])
    return DFA(states=states, input_symbols=input_symbols, transitions=transitions,
                initial_state=initial_state, final_states=final_states)


def DFA_to_json(self) -> DFAJsonDict:
    json_states = sorted(self.states, key=str)
    json_input_symbols = sorted(self.input_symbols)
    json_transitions = self.transitions
    json_initial_state = self.initial_state
    json_final_states = sorted(self.final_states, key=str)

    return {
        'states': json_states,
        'input_symbols': json_input_symbols,
        'transitions': json_transitions,
        'initial_state': json_initial_state,
        'final_states': json_final_states
    }
