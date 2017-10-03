import lxml.html
from html import escape
import chevron
import to_precision
import prairielearn as pl


def prepare(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    required_attribs = ['answers_name']
    optional_attribs = ['weight', 'correct_answer', 'label', 'suffix', 'display', 'comparison', 'rtol', 'atol', 'digits', 'eps_digits']
    pl.check_attribs(element, required_attribs, optional_attribs)
    name = pl.get_string_attrib(element, 'answers_name')

    correct_answer = pl.get_float_attrib(element, 'correct_answer', None)
    if correct_answer is not None:
        if name in data['correct_answers']:
            raise Exception('duplicate correct_answers variable name: %s' % name)
        data['correct_answers'][name] = correct_answer

    return data


def render(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    label = pl.get_string_attrib(element, 'label', None)
    suffix = pl.get_string_attrib(element, 'suffix', None)
    display = pl.get_string_attrib(element, 'display', 'inline')

    if data['panel'] == 'question':
        editable = data['editable']
        raw_submitted_answer = data['raw_submitted_answers'].get(name, None)

        # Get comparison parameters and info strings
        comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
        if comparison == 'relabs':
            rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
            atol = pl.get_float_attrib(element, 'atol', 1e-8)
            info_params = {'format': True, 'relabs': True, 'rtol': rtol, 'atol': atol}
        elif comparison == 'sigfig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'sigfig': True, 'digits': digits}
        elif comparison == 'decdig':
            digits = pl.get_integer_attrib(element, 'digits', 2)
            info_params = {'format': True, 'decdig': True, 'digits': digits}
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)
        with open('pl_number_input.mustache', 'r') as f:
            info = chevron.render(f, info_params).strip()
        with open('pl_number_input.mustache', 'r') as f:
            info_params.pop('format', None)
            info_params['shortformat'] = True
            shortinfo = chevron.render(f, info_params).strip()

        html_params = {'question': True, 'name': name, 'label': label, 'suffix': suffix, 'editable': editable, 'info': info, 'shortinfo': shortinfo}
        if display == 'inline':
            html_params['inline'] = True
        elif display == 'block':
            html_params['block'] = True
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline", "block", or "display")' % display)
        if raw_submitted_answer is not None:
            html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_number_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()

    elif data['panel'] == 'submission':
        parse_error = data['format_errors'].get(name, None)
        html_params = {'submission': True, 'label': label, 'parse_error': parse_error}
        if parse_error is None:
            a_sub = data['submitted_answers'][name]
            html_params['suffix'] = suffix
            html_params['a_sub'] = '{:.12g}'.format(a_sub)
        else:
            raw_submitted_answer = data['raw_submitted_answers'].get(name, None)
            if raw_submitted_answer is not None:
                html_params['raw_submitted_answer'] = escape(raw_submitted_answer)
        with open('pl_number_input.mustache', 'r') as f:
            html = chevron.render(f, html_params).strip()
    elif data['panel'] == 'answer':
        a_tru = pl.from_json(data['correct_answers'].get(name, None))
        if a_tru is not None:

            # Get comparison parameters
            comparison = pl.get_string_attrib(element, 'comparison', 'relabs')
            if comparison == 'relabs':
                rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
                atol = pl.get_float_attrib(element, 'atol', 1e-8)
                # FIXME: render correctly with respect to rtol and atol
                a_tru = '{:.12g}'.format(a_tru)
            elif comparison == 'sigfig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = to_precision.to_precision(a_tru, digits)
            elif comparison == 'decdig':
                digits = pl.get_integer_attrib(element, 'digits', 2)
                a_tru = '{:.{ndigits}f}'.format(a_tru, ndigits=digits)
            else:
                raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

            # FIXME: render correctly with respect to method of comparison
            html_params = {'answer': True, 'label': label, 'a_tru': a_tru, 'suffix': suffix}
            with open('pl_number_input.mustache', 'r') as f:
                html = chevron.render(f, html_params).strip()
        else:
            html = ''
    else:
        raise Exception('Invalid panel type: %s' % data['panel'])

    return html


def parse(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data['submitted_answers'].get(name, None)
    if not a_sub:
        data['format_errors'][name] = 'No submitted answer.'
        data['submitted_answers'][name] = None
        return data

    # Replace unicode minus with hyphen minus wherever it occurs
    a_sub = a_sub.replace(u'\u2212', '-')

    # Convert to float
    try:
        data['submitted_answers'][name] = float(a_sub)
    except ValueError:
        data['format_errors'][name] = 'Invalid format (not a real number).'
        data['submitted_answers'][name] = None

    return data


def grade(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')

    # Get weight
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = pl.from_json(data['correct_answers'].get(name, None))
    if a_tru is None:
        return data

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data['submitted_answers'].get(name, None)
    if a_sub is None:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}
        return data

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, 'comparison', 'relabs')

    # Compare submitted answer with true answer
    if comparison == 'relabs':
        rtol = pl.get_float_attrib(element, 'rtol', 1e-5)
        atol = pl.get_float_attrib(element, 'atol', 1e-8)
        correct = pl.is_correct_scalar_ra(a_sub, a_tru, rtol, atol)
    elif comparison == 'sigfig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        eps_digits = pl.get_integer_attrib(element, 'eps_digits', 3)
        correct = pl.is_correct_scalar_sf(a_sub, a_tru, digits, eps_digits)
    elif comparison == 'decdig':
        digits = pl.get_integer_attrib(element, 'digits', 2)
        eps_digits = pl.get_integer_attrib(element, 'eps_digits', 3)
        correct = pl.is_correct_scalar_dd(a_sub, a_tru, digits, eps_digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight}

    return data


def test(element_html, element_index, data):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, 'answers_name')
    weight = pl.get_integer_attrib(element, 'weight', 1)

    # FIXME: randomize tests

    data['raw_submitted_answers'][name] = '%f' % pl.from_json(data['correct_answers'][name])
    data['partial_scores'][name] = {'score': 1, 'weight': weight}

    return data
