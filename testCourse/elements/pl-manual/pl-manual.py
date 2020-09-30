import prairielearn as pl
import lxml.html
import chevron
import json


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
    answers_name = pl.get_string_attrib(element, 'answers-name', None)
    # TODO: Status logic -- is this question graded or not yet?
    partial = data['partial_scores'].get(answers_name, {'score': 0, 'feedback': ''})
    partial_score = partial.get('score', 0)
    partial_feedback = partial.get('feedback', '')

    html_params = {
        # Grader v. student view
        'grader': False,

        # Common UUID & answer name params
        'uuid': pl.get_uuid(),
        'answers_name': answers_name,
        # Grab partials, feedback, and grading status, with defaults of 0 and empty string
        'score': partial_score,
        'feedback': partial_feedback,
        'needs_grading': True,

        # Inner html (grader view popover & html children)
        'html': None,
        'popover_html': None,

        # Config options on the manaul grading element
        'use_default_popover_body': pl.get_string_attrib(element, 'show-default', True)
    }

    if data['options']['overlay_grading_interface']:
        popover_inner_html = []
        children = []
        # Move anything with the pl-manual-* prefix into the popover body
        #       Append "score" and "feedback" values to the outer element
        # TODO: Unsure how to build this super extensibly, look @js file for how we build scores rn
        for child in element:
            if child.tag and child.tag.startswith('pl-manual-'):
                child.set('score', partial_score)
                child.set('feedback', partial_feedback)
                popover_inner_html.append({'html': pl.inner_html(child)})
            else:
                children.append({'html': pl.inner_html(child)})

        html_params['popover_contents'] = popover_inner_html
        html_params['popover'] = True

        with open('pl-manual.mustache', 'r', encoding='utf-8') as f:
            html_params['popover_html'] = chevron.render(f, html_params).strip()

        html_params['popover'] = False
        html_params['children'] = children
        html_params['grader'] = True

    else:
        html_params['popover'] = False
        html_params['student'] = True
        html_params['html'] = pl.inner_html(element)

    with open('pl-manual.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html
