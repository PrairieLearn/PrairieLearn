"""
This script generates the constants for the pygment-constants.ts file.
It is used to populate the dropdowns for the styles and lexers in the pl-code component.
"""

from pygments.lexers import get_all_lexers
from pygments.styles import get_all_styles

all_styles = get_all_styles()
all_lexers = get_all_lexers()

popular_styles = ["friendly", "sas", "monokai", "github-dark", "solarized-dark"]

# We assume that these names are identical to the names in highlight.js.
popular_lexers = [
    "python",
    "javascript",
    "typescript",
    "java",
    "c",
    "cpp",
    "csharp",
]
with open("pygment-constants.ts", "w") as f:
    f.write("export const supportedStyles = [\n")
    f.writelines(f"    '{style}',\n" for style in all_styles if style in popular_styles)
    f.write("] as const;\n")

    f.write("export const supportedLexers = {\n")
    lexer_name_map = {
        lexer_aliases[0]: lexer_name.replace("'", "\\'")
        for lexer_name, lexer_aliases, _, _ in all_lexers
        if len(lexer_aliases) > 0 and lexer_aliases[0] in popular_lexers
    }
    # Only write the popular lexers
    f.writelines(
        f"    '{lexer_alias}': '{lexer_name_map[lexer_alias]}',\n"
        for lexer_alias in lexer_name_map
    )
    f.write("} as const;\n")
