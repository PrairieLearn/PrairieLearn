from pathlib import Path

import mkdocs_gen_files

nav = mkdocs_gen_files.Nav()

PYTHON_ROOT = Path("apps") / "prairielearn" / "python"
PRAIRIELEARN_ROOT = PYTHON_ROOT / "prairielearn"
# Currently, we have a flat structure, so we don't need to recurse.
# nav[("prairielearn")] = "index.md"
for path in sorted(PRAIRIELEARN_ROOT.glob("*.py")):
    # Ignore internal code
    if "internal" in path.parts:
        continue
    if "__init__" in path.name:
        continue

    # Get the path relative to the python root
    file_path = path.relative_to(PYTHON_ROOT).with_suffix("")
    module_path = path.relative_to(PRAIRIELEARN_ROOT).with_suffix("")
    # module_path = PYTHON_ROOT.with_suffix("")
    full_doc_path = Path("python-reference") / file_path.with_suffix(".md")
    # print(module_path, doc_path)
    toc_path = [
        part
        # f'<code class="doc-symbol doc-symbol-nav doc-symbol-module"></code> {part}'
        for part in module_path.parts
    ]
    print(toc_path)
    # print(toc_path)
    nav[toc_path] = file_path.with_suffix(".md")

    with mkdocs_gen_files.open(full_doc_path, "w") as f:
        print(file_path)
        ident = ".".join(file_path.parts)
        print("::: " + ident, file=f)

    mkdocs_gen_files.set_edit_path(full_doc_path, path)

print("NAV", list(nav.items()))
# nav["mkdocs_autorefs", "references"] = "autorefs/references.md"
# nav["mkdocs_autorefs", "plugin"] = "autorefs/plugin.md"

with mkdocs_gen_files.open("python-reference/SUMMARY.md", "w") as nav_file:
    nav_file.writelines(nav.build_literate_nav())

with open(nav_file.name) as f:
    print(f.read())
