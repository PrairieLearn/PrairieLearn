from text_unidecode import unidecode


def full_unidecode(input_str: str) -> str:
    """Does unidecode of input and replaces the unicode minus with the normal one."""
    return unidecode(input_str.replace("\u2212", "-"))
