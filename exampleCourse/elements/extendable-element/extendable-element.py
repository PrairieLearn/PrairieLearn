import prairielearn
import chevron


def render(element_html, data):
    extensions = prairielearn.load_all_extensions_for_element(data)
    ext_params = []
    for name, ext in extensions.items():
        ext_params.append({
            'name': name,
            'html': ext['render_this_extension']()
        })
    with open('extendable-element.mustache', 'r') as f:
        return chevron.render(f.read(), {'extensions': ext_params}).strip()
