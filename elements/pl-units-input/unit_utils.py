def grade_unit_only_input(submitted_ans: str) -> Tuple[bool, None]:
    parsed_submission = ureg.Quantity(submitted_ans)
    if parsed_correct_ans.units == parsed_submission.units:
        return True, None

    return False, "Your answer is incorrect."



def grade_unit_input(submitted_ans: str) -> Tuple[float, Optional[str]]:
    # will return no error, assuming parse() catches all of them
    parsed_submission = ureg.Quantity(submitted_ans)
    magnitudes_match = magnitude_comparison(parsed_correct_ans, parsed_submission)
    units_match = parsed_correct_ans.units == parsed_submission.units

    if magnitudes_match and units_match:
        return 1.0, None
    elif magnitudes_match and not units_match:
        return 0.7, "The magnitude of your answer is correct, but your units are incorrect."
    elif units_match and not magnitudes_match:
        return 0.3, "Your answer has correct units, but the magnitude does not match the reference solution."

    return 0.0, "Your answer is incorrect."
