import copy

import json_utils as ju
import pytest
from typing_extensions import assert_never

INPUT_SYMBOLS = ["0", "1"]
EPSILON_SYMBOL = "e"


def fsm_dict_to_nfa(fsm_dict: ju.FSMRawJsonDict) -> ju.FSMRawJsonDict:
    new_fsm_dict = copy.deepcopy(fsm_dict)
    new_fsm_dict["input_symbols"].append(new_fsm_dict["epsilon_symbol"])
    return new_fsm_dict


def assert_fsm_json_exception_contains(
    fsm_json: ju.FSMRawJsonDict,
    fsm_type: ju.FSMType,
    *,
    dump_state: bool = False,
    expected_states: ju.ErrorStatesT = None,
    expected_transitions: ju.ErrorTransitionsT = None
) -> None:
    with pytest.raises(ju.JsonValidationException) as err:
        if fsm_type is ju.FSMType.DFA:
            ju.dfa_convert_json(fsm_json, dump_state)
        elif fsm_type is ju.FSMType.NFA:
            if dump_state:
                raise ValueError("NFAs should not have explicit dump states")
            ju.nfa_convert_json(fsm_json)
        else:
            assert_never(fsm_type)

    error_states = err.value.states

    # Check for expected states
    if expected_states is None:
        assert error_states is None
    else:
        assert error_states is not None
        assert error_states == expected_states

    error_transitions = err.value.transitions

    # Check for expected transitions
    if expected_transitions is None:
        assert error_transitions is None
    else:
        assert error_transitions is not None
        assert error_transitions == expected_transitions


def test_exception_empty_state_name() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["", "q1"],
        "transitions": {"": {"0": [""], "1": [""]}, "q1": {"0": [""], "1": [""]}},
        "initial_state": ["q1"],
        "final_states": [""],
    }

    assert_fsm_json_exception_contains(fsm_json, ju.FSMType.DFA, expected_states={""})
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json), ju.FSMType.NFA, expected_states={""}
    )


def test_exception_duplicate_states() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q1"],
        "transitions": {"q1": {"0": ["q1"], "1": ["q1"]}},
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(fsm_json, ju.FSMType.DFA, expected_states={"q1"})
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json), ju.FSMType.NFA, expected_states={"q1"}
    )


def test_exception_multiple_start_states() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {
            "q1": {"0": ["q1"], "1": ["q2"]},
            "q2": {"0": ["q1"], "1": ["q2"]},
        },
        "initial_state": ["q1", "q2"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json,
        ju.FSMType.DFA,
        expected_states={"q1", "q2"},
        expected_transitions={(None, None, "q1"), (None, None, "q2")},
    )
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json),
        ju.FSMType.NFA,
        expected_states={"q1", "q2"},
        expected_transitions={(None, None, "q1"), (None, None, "q2")},
    )


def test_exception_no_final_state() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1"],
        "transitions": {"q1": {"0": ["q1"], "1": ["q1"]}},
        "initial_state": ["q1"],
        "final_states": [],
    }

    assert_fsm_json_exception_contains(fsm_json, ju.FSMType.DFA)
    assert_fsm_json_exception_contains(fsm_dict_to_nfa(fsm_json), ju.FSMType.NFA)


def test_exception_duplicate_transitions() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1"],
        "transitions": {"q1": {"0": ["q1", "q1"], "1": ["q1"]}},
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json,
        ju.FSMType.DFA,
        expected_transitions={("q1", "0", "q1"), ("q1", "0", "q1")},
    )
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json),
        ju.FSMType.NFA,
        expected_transitions={("q1", "0", "q1")},
    )


def test_exception_missing_transitions() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {
            "q1": {"0": ["q2"]},
            "q2": {"1": ["q1"], "0": ["q2"]},
        },
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json,
        ju.FSMType.DFA,
        expected_states={"q1"},
        expected_transitions={("q1", "1", None)},
    )


def test_exception_invalid_character() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {
            "q1": {"0": ["q1"], "1": ["q1"], "01": ["q2"]},
            "q2": {"0": ["q2"], "1": ["q2"], "10": ["q1"]},
        },
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json,
        ju.FSMType.DFA,
        expected_transitions={("q1", "01", "q2"), ("q2", "10", "q1")},
    )
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json),
        ju.FSMType.NFA,
        expected_transitions={("q1", "01", "q2"), ("q2", "10", "q1")},
    )


def test_exception_blank_character() -> None:
    "This specific formatting is needed to make the display work correctly"
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {
            "q1": {"0": ["q1"], "1": ["q1"], "": ["q2"]},
            "q2": {"0": ["q2"], "1": ["q2"], "": ["q1"]},
        },
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json,
        ju.FSMType.DFA,
        expected_transitions={("q1", "", "q2"), ("q2", "", "q1")},
    )
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json),
        ju.FSMType.NFA,
        expected_transitions={("q1", "", "q2"), ("q2", "", "q1")},
    )


@pytest.mark.xfail
def test_exception_unreachable_states() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {
            "q1": {
                "0": ["q1"],
                "1": ["q1"],
            },
            "q2": {"0": ["q1"], "1": ["q1"]},
        },
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(fsm_json, ju.FSMType.DFA, expected_states={"q2"})
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json), ju.FSMType.NFA, expected_states={"q2"}
    )


@pytest.mark.xfail
def test_exception_unreachable_states_dump_state() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {"q1": {"0": ["q1"], "1": ["q1"]}, "q2": {"0": ["q1"]}},
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json, ju.FSMType.DFA, dump_state=True, expected_states={"q2"}
    )
    assert_fsm_json_exception_contains(
        fsm_dict_to_nfa(fsm_json), ju.FSMType.NFA, expected_states={"q2"}
    )


# --------------------------- DFA Specific Tests ------------------------------


def test_dfa_exception_duplicate_character_transitions() -> None:
    fsm_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1", "q2"],
        "transitions": {
            "q1": {"0": ["q1", "q2"], "1": ["q1"]},
            "q2": {"0": ["q1"], "1": ["q1"]},
        },
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    assert_fsm_json_exception_contains(
        fsm_json,
        ju.FSMType.DFA,
        expected_transitions={("q1", "0", "q1"), ("q1", "0", "q2")},
    )


def test_dfa_no_exception_redundant_dump_state() -> None:
    dfa_json: ju.FSMRawJsonDict = {
        "input_symbols": INPUT_SYMBOLS,
        "epsilon_symbol": EPSILON_SYMBOL,
        "states": ["q1"],
        "transitions": {"q1": {"0": ["q1"], "1": ["q1"]}},
        "initial_state": ["q1"],
        "final_states": ["q1"],
    }

    # Shouldn't raise an exception
    ju.dfa_convert_json(dfa_json, True)
