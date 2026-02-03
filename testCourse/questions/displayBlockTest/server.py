def generate(data):
    # String inputs
    data["correct_answers"]["string_block"] = "hello"
    data["correct_answers"]["string_block2"] = "world"
    data["correct_answers"]["string_inline"] = "foo"
    data["correct_answers"]["string_inline2"] = "bar"

    # Number inputs
    data["correct_answers"]["number_block"] = 42.5
    data["correct_answers"]["number_block2"] = 99.9
    data["correct_answers"]["number_inline"] = 100.0
    data["correct_answers"]["number_inline2"] = 55.5

    # Integer inputs
    data["correct_answers"]["integer_block"] = 42
    data["correct_answers"]["integer_block2"] = 100
    data["correct_answers"]["integer_inline"] = 7
    data["correct_answers"]["integer_inline2"] = 13

    # Units inputs
    data["correct_answers"]["units_block"] = "9.8 m/s^2"
    data["correct_answers"]["units_block2"] = "100 kg"
    data["correct_answers"]["units_inline"] = "5 m"
    data["correct_answers"]["units_inline2"] = "10 s"

    # Symbolic inputs
    data["correct_answers"]["symbolic_block"] = "x^2"
    data["correct_answers"]["symbolic_block2"] = "2*x + 1"
    data["correct_answers"]["symbolic_inline"] = "x"
    data["correct_answers"]["symbolic_inline2"] = "x + 1"

    # Big-O inputs
    data["correct_answers"]["bigo_block"] = "n^2"
    data["correct_answers"]["bigo_block2"] = "n*log(n)"
    data["correct_answers"]["bigo_inline"] = "n"
    data["correct_answers"]["bigo_inline2"] = "log(n)"
