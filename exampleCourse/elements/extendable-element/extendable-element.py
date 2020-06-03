import prairielearn as pl
import chevron


def render(element_html, data):
    extensions = pl.load_all_extensions(data)
    ext_params = []
    for name, ext in extensions.items():
        ext_params.append({
            'name': name,
            'html': ext.render_this_extension(data['options']['client_files_extensions_url'][name])
        })
    with open('extendable-element.mustache', 'r') as f:
        return chevron.render(f.read(), {'extensions': ext_params}).strip()
