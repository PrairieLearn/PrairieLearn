import prairielearn as pl
import lxml.html
import chevron


def prepare(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
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

    # TODO: Add checks for the correct views (only show in view question mode)
    # TODO: We should be able to pre-load partials & scores at some higher level
    #       so we need to add a query at a higher level to populate all of this
    #       for now, we're just gating behind the instructor view
    # TODO: Render popover as nested HTML, or create a "form" element that we can wrap and pass on
    #       and create a seperate rubric toggle
    #       this will require looking into the PL form submission logic--do we create a workflow to "cough things up"?
    #       manual grading should control scores, so we should look for elements with a certian toggle or data id
    # TODO: Can we wrap the manual grading mode in a form that requires instructor ID to submit, and then have form fields
    #       that cough up all the info we need for manual grading, and then hit the endoint
    html_params = {
        'answers-name': answers_name,
        'html': pl.inner_html(element),
        'uuid': pl.get_uuid(),
        'partial_score': 0
        # 'partial_score': data['partial_scores'][answers_name]
    }

    with open('pl-manual.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()

    return html


def grade(element_html, data):
    # TODO: do we even have a grade step? we should be relying upon the form submission for this element,
    #       and the rendering should be purely structural
    return
