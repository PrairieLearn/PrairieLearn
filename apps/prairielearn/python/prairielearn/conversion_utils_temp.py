def string_partition_first_interval(
    s: str, left: str = "[", right: str = "]"
) -> tuple[str, str, str]:
    # Split at first left delimiter
    (s_before_left, _, s) = s.partition(left)
    # Split at first right delimiter
    (s, _, s_after_right) = s.partition(right)
    # Return results
    return s_before_left, s, s_after_right


def string_partition_outer_interval(
    s: str, left: str = "[", right: str = "]"
) -> tuple[str, str, str]:
    # Split at first left delimiter
    (s_before_left, _, s) = s.partition(left)
    # Split at last right delimiter
    (s, _, s_after_right) = s.rpartition(right)
    # Return results
    return s_before_left, s, s_after_right

def string_to_number(
    s: str, *, allow_complex: bool = True
) -> np.float64 | np.complex128 | None:
    """
    Parse a string that can be interpreted either as float or (optionally) complex,
    and return a number with type np.float64 or np.complex128, or None on parse error.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace("\u2212", "-")
    # If complex numbers are allowed...
    if allow_complex:
        # Replace "i" with "j" wherever it occurs
        s = s.replace("i", "j")
        # Strip white space on either side of "+" or "-" wherever they occur
        s = re.sub(r" *\+ *", "+", s)
        s = re.sub(r" *\- *", "-", s)
    # Try to parse as float
    try:
        s_float = float(s)
        return np.float64(s_float)
    except Exception:
        # If that didn't work, either pass (and try to parse as complex) or return None
        if allow_complex:
            pass
        else:
            return None
    # Try to parse as complex
    try:
        s_complex = complex(s)
        return np.complex128(s_complex)
    except Exception:
        # If that didn't work, return None
        return None


def string_to_2darray(
    s: str, *, allow_complex: bool = True
) -> tuple[npt.NDArray[Any] | None, dict[str, str]]:
    """
    Parse a string that is either a scalar or a 2D array in matlab or python
    format. Each number must be interpretable as type float or complex.
    """
    # Replace unicode minus with hyphen minus wherever it occurs
    s = s.replace("\u2212", "-")
    # If complex numbers are allowed...
    if allow_complex:
        # Replace "i" with "j" wherever it occurs
        s = s.replace("i", "j")

    # Count left and right brackets and check that they are balanced
    number_of_left_brackets = s.count("[")
    number_of_right_brackets = s.count("]")

    if number_of_left_brackets != number_of_right_brackets:
        return (None, {"format_error": "Unbalanced square brackets."})

    # If there are no brackets, treat as scalar
    result_type: Literal["python", "matlab", "scalar"]
    if number_of_left_brackets == 0:
        # If there are no brackets, treat as scalar
        result_type = "scalar"
    elif number_of_left_brackets == 1:
        # If there is only one set of brackets, treat as MATLAB format
        result_type = "matlab"
    else:
        # If there is more than one set of brackets, treat as python format
        result_type = "python"

    # Get string between outer brackets
    if result_type != "scalar":
        (s_before_left, s, s_after_right) = string_partition_outer_interval(s)

        # Return error if there is anything but space outside brackets
        s_before_left = s_before_left.strip()
        s_after_right = s_after_right.strip()
        if s_before_left:
            return (
                None,
                {
                    "format_error": f"Non-empty text {escape_invalid_string(s_before_left)} before outer brackets."
                },
            )
        if s_after_right:
            return (
                None,
                {
                    "format_error": f"Non-empty space {escape_invalid_string(s_after_right)} after outer brackets."
                },
            )

    if result_type == "scalar":
        try:
            # Convert submitted answer (assumed to be a scalar) to float or (optionally) complex
            ans = string_to_number(s, allow_complex=allow_complex)
            if ans is None:
                raise ValueError("invalid submitted answer (wrong type)")
            if not np.isfinite(ans):
                raise ValueError("invalid submitted answer (not finite)")
            matrix = np.array([[ans]])
            # Return it with no error
            return (matrix, {"format_type": "python"})
        except Exception:
            # Return error if submitted answer could not be converted to float or complex
            if allow_complex:
                return (
                    None,
                    {
                        "format_error": "Invalid format (missing square brackets and could not be interpreted as a double-precision floating-point number or as a double-precision complex number)."
                    },
                )
            else:
                return (
                    None,
                    {
                        "format_error": "Invalid format (missing square brackets and could not be interpreted as a double-precision floating-point number)."
                    },
                )
    elif result_type == "matlab":
        # Can NOT strip white space on either side of "+" or "-" wherever they occur,
        # because there is an ambiguity between space delimiters and whitespace.
        #
        #   Example:
        #       is '[1 - 2j]' the same as '[1 -2j]' or '[1-2j]'

        # Split on semicolon
        s_list = s.split(";")

        # Get number of rows
        m = len(s_list)

        # Return error if there are no rows (i.e., the matrix is empty)
        if m == 0:
            return (None, {"format_error": "The matrix has no rows."})

        # Regex to split rows a la MATLAB
        matlab_delimiter_regex = re.compile(r"\s*[\s,]\s*")

        # Get number of columns by splitting first row
        tokens = re.split(matlab_delimiter_regex, s_list[0])
        n = len(tokens)

        # Ignore first/last token if empty string (occurs when row leads/trails with valid delimiter)
        if n > 0 and not tokens[0]:
            n -= 1
        if n > 0 and not tokens[-1]:
            n -= 1

        # Return error if first row has no columns
        if n == 0:
            return (None, {"format_error": "Row 1 of the matrix has no columns."})

        # Define matrix in which to put result
        matrix = np.zeros((m, n))

        # Iterate over rows
        for i in range(m):
            # Split row
            s_row = re.split(matlab_delimiter_regex, s_list[i])

            # Ignore first/last token if empty string (occurs when row leads/trails with valid delimiter)
            if s_row and not s_row[0]:
                s_row.pop(0)
            if s_row and not s_row[-1]:
                s_row.pop(-1)

            # Return error if current row has more or less columns than first row
            if len(s_row) != n:
                return (
                    None,
                    {
                        "format_error": f"Rows 1 and {i + 1} of the matrix have a different number of columns."
                    },
                )

            # Iterate over columns
            j = 0
            try:
                for j in range(n):
                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError("invalid submitted answer (wrong type)")

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError("invalid submitted answer (not finite)")

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        matrix = matrix.astype(np.complex128, copy=False)

                    # Insert the new entry
                    matrix[i, j] = ans
            except Exception:
                # Return error if entry could not be converted to float or complex
                return (
                    None,
                    {
                        "format_error": f"Entry {escape_invalid_string(s_row[j])} at location (row={i + 1}, column={j + 1}) in the matrix has an invalid format."
                    },
                )

        # Return resulting ndarray with no error
        return (matrix, {"format_type": "matlab"})
    elif result_type == "python":
        # Strip white space on either side of "+" or "-" wherever they occur
        s = re.sub(r" *\+ *", "+", s)
        s = re.sub(r" *\- *", "-", s)

        # Return error if there are any semicolons
        if ";" in s:
            return (
                None,
                {
                    "format_error": "Semicolons cannot be used as delimiters in an expression with nested brackets."
                },
            )

        # Partition string into rows
        s_row = []
        while s:
            # Get next row
            (
                s_before_left,
                s_between_left_and_right,
                s_after_right,
            ) = string_partition_first_interval(s)
            s_before_left = s_before_left.strip()
            s_after_right = s_after_right.strip()
            s_between_left_and_right = s_between_left_and_right.strip()
            s_row.append(s_between_left_and_right)

            # Return error if there is anything but space before left bracket
            if s_before_left:
                return (
                    None,
                    {
                        "format_error": f"Non-empty text {escape_invalid_string(s_before_left)} before the left bracket in row {len(s_row)} of the matrix."
                    },
                )

            # Return error if there are improperly nested brackets
            if ("[" in s_between_left_and_right) or ("]" in s_between_left_and_right):
                return (
                    None,
                    {
                        "format_error": f"Improperly nested brackets in row {len(s_row)} of the matrix."
                    },
                )

            # Check if we are in the last row
            if len(s_row) == number_of_left_brackets - 1:
                # Return error if it is the last row and there is anything but space after right bracket
                if s_after_right:
                    return (
                        None,
                        {
                            "format_error": f"Non-empty text {escape_invalid_string(s_after_right)} after the right bracket in row {len(s_row)} of the matrix."
                        },
                    )
                else:
                    s = s_after_right
            # Return error if it is not the last row and there is no comma after right bracket
            elif s_after_right[0] != ",":
                return (
                    None,
                    {"format_error": f"No comma after row {len(s_row)} of the matrix."},
                )
            else:
                s = s_after_right[1:]
        number_of_rows = len(s_row)

        # Check that number of rows is what we expected
        if number_of_rows != number_of_left_brackets - 1:
            raise ValueError(
                f"Number of rows {number_of_rows} should have been one less than the number of brackets {number_of_left_brackets}"
            )

        # Split each row on comma
        number_of_columns = None
        for i in range(number_of_rows):
            # Return error if row has no columns
            if not s_row[i]:
                return (
                    None,
                    {"format_error": f"Row {i + 1} of the matrix has no columns."},
                )

            # Splitting on a comma always returns a list with at least one element
            s_row[i] = s_row[i].split(",")
            n = len(s_row[i])

            # Return error if row has different number of columns than first row
            if number_of_columns is None:
                number_of_columns = n
            elif number_of_columns != n:
                return (
                    None,
                    {
                        "format_error": f"Rows 1 and {i + 1} of the matrix have a different number of columns."
                    },
                )

        if number_of_columns is None:
            return (None, {"format_error": "The matrix has no columns."})
        # Define matrix in which to put result
        matrix = np.zeros((number_of_rows, number_of_columns))

        # Parse each row and column
        i, j = 0, 0
        try:
            for i in range(number_of_rows):
                for j in range(number_of_columns):
                    # Check if entry is empty
                    if not s_row[i][j].strip():
                        return (
                            None,
                            {
                                "format_error": f"Entry at location (row={i + 1}, column={j + 1}) in the matrix is empty."
                            },
                        )

                    # Convert entry to float or (optionally) complex
                    ans = string_to_number(s_row[i][j], allow_complex=allow_complex)
                    if ans is None:
                        raise ValueError("invalid submitted answer (wrong type)")

                    # Return error if entry is not finite
                    if not np.isfinite(ans):
                        raise ValueError("invalid submitted answer (not finite)")

                    # If the new entry is complex, convert the entire array in-place to np.complex128
                    if np.iscomplexobj(ans):
                        matrix = matrix.astype(np.complex128, copy=False)

                    # Insert the new entry
                    matrix[i, j] = ans
        except Exception:
            # Return error if entry could not be converted to float or complex
            return (
                None,
                {
                    "format_error": f"Entry {escape_invalid_string(s_row[i][j])} at location (row={i + 1}, column={j + 1}) of the matrix has an invalid format."
                },
            )

        # Return result with no error
        return (matrix, {"format_type": "python"})
    assert_never(result_type)
