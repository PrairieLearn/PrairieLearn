import prairielearn as pl
import lxml.html
import mistune
import re


class PrairieLearnRenderer(mistune.Renderer):
    def block_code(self, code, lang):
        attrs = []

        if lang:
            m = re.search('([^\{]*)?(\{(.*)\})?', lang)
            language = m.group(1)
            highlight_lines = m.group(3)
            if (language):
                attrs.append('language="%s"' % language)
            else:
                attrs.append('no-highlight="true"')
            if highlight_lines:
                attrs.append('highlight-lines="%s"' % highlight_lines)


        concat_args = ' '.join(attrs)
        contents = u'<pl-code %s>%s</pl-code>' % (concat_args, mistune.escape(code))
        return contents


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=[], optional_attribs=[])


def render(element_html, data):
    # Yeah, I know we're not supposed to parse HTML with Regex, but...
    m = re.search('<pl-markdown[^>]*>(.*)</pl-markdown>', element_html, re.DOTALL)
    contents = m.group(1)
    renderer = PrairieLearnRenderer()
    markdown = mistune.Markdown(renderer=renderer)
    return markdown(contents)
