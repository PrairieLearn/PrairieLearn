import prairielearn as pl
import lxml.html
import math

use_pl_variable_score = False


def prepare(element_html, data):
    if not use_pl_variable_score:
        return

    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, required_attribs=['answers-name'], optional_attribs=[])


def render(element_html, data):
    if not use_pl_variable_score:
        return ''

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers-name')

    if data['panel'] == 'answer':
        return ''

    partial_score = data['partial_scores'].get(name, {'score': None, 'feedback': None})
    score = partial_score.get('score', None)
    feedback = partial_score.get('feedback', None)

    if score is None:
        return ''

    try:
        score = float(score)
    except Exception:
        return '<span class="badge badge-danger">ERROR: invalid score: ' + score + '</span>'

    if score >= 1:
        html = '<span class="badge badge-success">' \
            + '<i class="fa fa-check" aria-hidden="true"></i>' \
            + (' correct: %d%%' % math.floor(score * 100)) \
            + ((' (' + feedback + ')') if feedback else '') \
            + '</span>'
    elif score > 0:
        html = '<span class="badge badge-warning">' \
            + '<i class="fa fa-circle-o" aria-hidden="true"></i>' \
            + (' partially correct: %d%%' % math.floor(score * 100)) \
            + ((' (' + feedback + ')') if feedback else '') \
            + '</span>'
    else:
        html = '<span class="badge badge-danger">' \
            + '<i class="fa fa-times" aria-hidden="true"></i>' \
            + (' incorrect: %d%%' % math.floor(score * 100)) \
            + ((' (' + feedback + ')') if feedback else '') \
            + '</span>'

    return html
