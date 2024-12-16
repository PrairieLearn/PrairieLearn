import dbm
import re
from hashlib import sha1
from pathlib import Path

from mkdocs.config.defaults import MkDocsConfig
from mkdocs.plugins import get_plugin_logger
from mkdocs.structure.pages import Page
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

    def new_render(source, opts, *args, **kwargs):
        """
        Hook into the renderer to provide a link to the rendered SVG.
        This only hooks into the renderer for superfences, not for images.
        """
        values = original_render(source, opts, *args, **kwargs)
        result, ok = values[0], values[-1]
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

            values[0] = f'<data data-svg-file="{key.hex()}">{result}</data>'
        return values

    # Replace the superfences renderer with the new one
    plugin.renderer = new_render
    # Replace the img renderer with the new one
    config["mdx_configs"]["d2_img"]["renderer"] = new_render
    return config


def on_page_content(html: str, page: Page, config, files):
    relative_route = page.url.count("/") * "../" + "assets/svg/"
    # Replace data-svg-file with a href to the svg file.
    # This has to be done after we check for missing file references
    return re.sub(
        r'<data data-svg-file="([a-f0-9]+)">([\s\S]*?)</data>',
        r'<a href="{relative_route}\1.svg">\2</a>'.format(
            relative_route=relative_route
        ),
        html,
    )


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

    get_plugin_logger(__name__).info(f"Wrote {len(plugin.keys)} svg files")
    cache.close()
