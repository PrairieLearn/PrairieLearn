import re

from mkdocs.config.defaults import MkDocsConfig
from mkdocs.structure.pages import Page


def on_post_page(output: str, page: Page, config: MkDocsConfig) -> str | None:  # noqa: ARG001
    """
    HACK:
    With mdx_truly_sane_lists, a mismatched <p> tag is generated (see https://github.com/radude/mdx_truly_sane_lists/issues/23).
    We can't disable mdx_truly_sane_lists as the generated markdown would need additional indentation.
    We can't easily hook into the run function to fix the issue (https://github.com/radude/mdx_truly_sane_lists/blob/master/mdx_truly_sane_lists/mdx_truly_sane_lists.py#L91)

    Thus, we manually fix the issue by post-processing the generated markdown to remove the <p> tag.
    """
    output = re.sub(
        r"<p>(<details><summary>.*<\/summary>)<\/p>",
        r"\1",
        output,
    )
    return output
