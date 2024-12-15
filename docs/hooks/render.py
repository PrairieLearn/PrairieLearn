import dbm
from hashlib import sha1
from pathlib import Path

from mkdocs.config.defaults import MkDocsConfig
from mkdocs.utils import write_file

tracked_renders = {}


def on_config(config: MkDocsConfig) -> MkDocsConfig:
    plugin = next(
        x["validator"]
        for x in config["mdx_configs"]["pymdownx.superfences"]["custom_fences"]
        if x["name"] == "d2"
    ).__self__

    # Save the original render function, and track keys
    original_render = plugin.renderer
    plugin.keys = set()

    def new_render(source, opts):
        """
        Hook into the renderer to provide a link to the rendered SVG.
        This only hooks into the renderer for superfences, not for images.
        """
        result, ok = original_render(source, opts)

        if ok:
            is_file = isinstance(source, Path)
            if is_file:
                key = f"{source}_{source.stat().st_mtime}"
            else:
                key = source.hex()
            for opt in opts:
                key = f"{key}.{opt}"
            key = sha1(key.encode()).digest()
            plugin.keys.add(key)
            # Remove the XML declaration as it is no longer at the start of the entity
            result = result.replace('<?xml version="1.0" encoding="utf-8"?>', "")
            result = f'<a href="/assets/svg/{key.hex()}.svg">{result}</a>'
        return result, ok

    # Replace the superfences renderer with the new one
    plugin.renderer = new_render
    # Replace the img renderer with the new one
    config["mdx_configs"]["d2_img"]["renderer"] = new_render
    return config


def on_post_build(config: MkDocsConfig):
    cache = dbm.open(
        Path(config["plugins"]["d2"].config.cache_dir, "db").as_posix(), "c"
    )
    plugin = next(
        x["validator"]
        for x in config["mdx_configs"]["pymdownx.superfences"]["custom_fences"]
        if x["name"] == "d2"
    ).__self__
    svg_path = Path(config["site_dir"]) / "assets" / "svg"
    for key in plugin.keys:
        write_file(cache[key], str(svg_path / f"{key.hex()}.svg"))

    print(f"Wrote {len(plugin.keys)} svg files")
    cache.close()
