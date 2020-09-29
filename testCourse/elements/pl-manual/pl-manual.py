import prairielearn as pl
import lxml.html
import chevron


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)

    required_attribs = ['answers-name']
    optional_attribs = ['show-default']
    pl.check_attribs(element, required_attribs, optional_attribs)

    answers_name = pl.get_string_attrib(element, 'answers-name', None)
    partial_child = list(filter(lambda child: not isinstance(child, lxml.html.HtmlComment)
                                and pl.get_string_attrib(child, 'answers-name', '') == answers_name, element))

    if len(partial_child) == 0:
        raise Exception(f'No direct children have {answers_name} as an answers-name attribute.')
    elif len(partial_child) > 1:
        raise Exception(f'At most one direct child can have {answers_name} as an answers-name attribute.')

    partial_child = partial_child[0]


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    if data['panel'] == 'submission' and data['options'].get('overlay_grading_interface', False):
        answers_name = pl.get_string_attrib(element, 'answers-name', None)
        show_default = pl.get_string_attrib(element, 'show-default', True)
        uuid = pl.get_uuid()

        partial_score = data['partial_scores'][answers_name]['score']
        partial_feedback = data['partial_scores'][answers_name]['feedback']
        finished_grading = 'graded'

        popover_body = []
        html = []
        print(show_default)
        if show_default:
            params = {
                'partial_score': partial_score,
                'partial_feedback': partial_feedback
            }
            with open('pl-manual-default.mustache', 'r', encoding='utf-8') as f:
                obj = {
                    'html': chevron.render(f, params).strip()
                }
                popover_body.append(obj)

        # Move anything with the pl-manual-* prefix into the popover body
        #       Append "score" and "feedback" values to the outer element
        # TODO: Unsure how to build this super extensibly, look @js file for how we build scores rn
        for child in element:
            if child.tag and child.tag.startswith('pl-manual-'):
                child.set('score', partial_score)
                child.set('feedback', partial_feedback)
                child.set('index', len(popover_body))
                popover_body.append(child)
            else:
                html.append({'html': pl.inner_html(child)})

        close_button = None
        with open('pl-manual-close.mustache', 'r', encoding='utf-8') as f:
            params = {
                'uuid': uuid
            }
            close_button = chevron.render(f, params).strip()

        html_params = {
            'answers_name': answers_name,
            'html': html,
            'popover_body': popover_body,
            'close_button': close_button,
            'uuid': uuid,
            'partial_score': partial_score,
            'partial_feedback': partial_feedback,
            'finished_grading': finished_grading,
            'show_grading': True
        }

        with open('pl-manual.mustache', 'r', encoding='utf-8') as f:
            html = chevron.render(f, html_params).strip()
    else:
        html = pl.inner_html(element)
    return html
