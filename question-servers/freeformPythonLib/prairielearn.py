import lxml.html

def inner_html(element):
    html = element.text
    for child in element:
        html += lxml.html.tostring(child, method="html", pretty_print=True).decode("utf-8")
    return html
