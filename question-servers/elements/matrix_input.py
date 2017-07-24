import lxml.html
import numpy as np
import sys
import prairielearn as pl
from html import escape


def prepare(element_html, element_index, data, options):
    return data

def render(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    label = pl.get_string_attrib(element,"label",None)

    if options["panel"] == "question":
        editable = options["editable"]
        raw_submitted_answer = options["raw_submitted_answer"].get(name, None)

        # Get method of comparison, with relabs as default
        comparison = pl.get_string_attrib(element, "comparison","relabs")
        # Get comparison parameters and info string
        if comparison=="relabs":
            rtol = pl.get_float_attrib(element,"rtol",1e-5)
            atol = pl.get_float_attrib(element,"atol",1e-8)
            info = 'Enclose it by a single pair of square brackets. ' \
                + 'Separate entries in each row with a space. ' \
                + 'Indicate the end of each intermediate row with a semicolon. ' \
                + 'Each entry must be a number. ' \
                + 'No symbolic expressions (those that involve fractions, ' \
                + 'square roots, variables, etc.) will be accepted. Scientific ' \
                + 'notation is accepted (e.g., 1.2e03). ' \
                + 'Numbers must be accurate' \
                + ' to within relative tolerance ' + ('%g' % rtol) \
                + ' and absolute tolerance ' + ('%g' % rtol) + '.'
        elif comparison=="sigfig":
            digits = pl.get_integer_attrib(element,"digits",2)
            info = 'Enclose it by a single pair of square brackets. ' \
                + 'Separate entries in each row with a space. ' \
                + 'Indicate the end of each intermediate row with a semicolon. ' \
                + 'Each entry must be a number. ' \
                + 'No symbolic expressions (those that involve fractions, ' \
                + 'square roots, variables, etc.) will be accepted. Scientific ' \
                + 'notation is accepted (e.g., 1.2e03). ' \
                + 'Numbers must be accurate' \
                + ' to ' + ('%d' % digits) + ' significant figures.'
        elif comparison=="decdig":
            digits = pl.get_integer_attrib(element,"digits",2)
            info = 'Enclose it by a single pair of square brackets. ' \
                + 'Separate entries in each row with a space. ' \
                + 'Indicate the end of each intermediate row with a semicolon. ' \
                + 'Each entry must be a number. ' \
                + 'No symbolic expressions (those that involve fractions, ' \
                + 'square roots, variables, etc.) will be accepted. Scientific ' \
                + 'notation is accepted (e.g., 1.2e03). ' \
                + 'Numbers must be accurate' \
                + ' to ' + ('%d' % digits) + ' digits after the decimal.'
        else:
            raise ValueError('method of comparison "%s" is not valid' % comparison)

        # Put javascript in html to enable popovers
        # FIXME: enable popovers someplace else

        html = '''<style>\n    .popover{max-width: 50%;}\n</style>\n\n'''
        html += '''<script>\n''' \
            + '''    $(document).ready(function(){\n''' \
            + '''        $('[data-toggle="popover"]').popover({container: 'body'});\n''' \
            + '''    });\n''' \
            + '''</script>\n\n'''

        html += '''<div class="input-group">\n'''
        if label is not None:
            html += '''    <label class="input-group-addon" id="basic-addon2">'''+label+'''</label>\n'''
        html += '''    <input name="'''+name+'''" type="text" class="form-control" ''' \
            + ('' if editable else ' disabled') \
            + ('' if (raw_submitted_answer is None) else (' value="' + escape(raw_submitted_answer) + '" ')) \
            + '''placeholder="[1 2 3; 4 5 6]" aria-describedby="basic-addon1" />\n''' \
            + '''    <span class="input-group-btn" id="basic-addon1">\n''' \
            + '''        <a class="btn btn-default" type="button" data-toggle="popover" title="MATLAB Format" data-content="'''+info+'''" data-placement="left" data-trigger="focus" tabindex="0">\n''' \
            + '''            <i class="fa fa-question-circle" aria-hidden="true"></i>\n''' \
            + '''        </a>\n''' \
            + '''    </span>\n''' \
            + '''</div>'''
    elif options["panel"] == "submission":
        parse_error = data["parse_errors"].get(name, None)
        if parse_error is not None:
            html = '''<div style="display: flex; align-items: center;">\n'''
            if label is not None:
                html += '''    <span style="white-space:nowrap;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+label+'''</span>\n'''
            html += '''    <pre style="flex:1;width:50%;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;"><strong>INVALID\n&nbsp;...&nbsp;</strong>'''+parse_error+'''</pre>\n''' \
                + '''</div>'''
        else:
            # Get submitted answer or throw exception if it does not exist
            a_sub = np.array(data["submitted_answer"][name])

            html = '''<div style="display: flex; align-items: center;">\n'''
            if label is not None:
                html += '''    <span style="white-space:nowrap;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+label+'''</span>\n'''
            html += '''    <pre style="flex:1;width:50%;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+pl.numpy_to_matlab(a_sub,ndigits=12,wtype='g')+'''</pre>\n''' \
                + '''</div>'''
    elif options["panel"] == "answer":
        # Get true answer - do nothing if it does not exist
        a_tru = data["true_answer"].get(name, None)
        if a_tru is not None:
            a_tru = np.array(a_tru)

            # FIXME: render correctly with respect to method of comparison
            
            html = '''<div style="display: flex; align-items: center;">\n'''
            if label is not None:
                html += '''    <span style="white-space:nowrap;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+label+'''</span>\n'''
            html += '''    <pre style="flex:1;width:50%;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;"> '''+pl.numpy_to_matlab(a_tru,ndigits=12,wtype='g')+''' </pre>\n''' \
                + '''</div>'''
        else:
            html = ""

    else:
        raise Exception("Invalid panel type: %s" % options["panel"])

    return html

def parse(element_html, element_index, data, options):
    # By convention, this function returns at the first error found

    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answer"].get(name,None)
    if a_sub is None:
        data["parse_errors"][name] = 'No submitted answer.'
        return data

    # Convert submitted answer to numpy array (return parse_error on failure)
    (a_sub_parsed,parse_error) = pl.matlab_to_numpy(a_sub)
    if a_sub_parsed is None:
        data["parse_errors"][name] = parse_error
        return data

    # Replace submitted answer with numpy array
    data["submitted_answer"][name] = a_sub_parsed.tolist()

    return data

def grade(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", 1)

    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["true_answer"].get(name,None)
    if a_tru is None:
        return data
    # Convert true answer to numpy
    a_tru = np.array(a_tru)
    # Throw an error if true answer is not a 2D numpy array
    if a_tru.ndim != 2:
        raise ValueError('true answer must be a 2D array')

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data["submitted_answer"].get(name,None)
    if a_sub is None:
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return data
    # Convert submitted answer to numpy
    a_sub = np.array(a_sub)

    # If true and submitted answers have different shapes, score is zero
    if not (a_sub.shape==a_tru.shape):
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return data

    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, "comparison","relabs")

    # Compare submitted answer with true answer
    if comparison=="relabs":
        rtol = pl.get_float_attrib(element,"rtol",1e-5)
        atol = pl.get_float_attrib(element,"atol",1e-8)
        correct = pl.is_correct_ndarray2D_ra(a_sub,a_tru,rtol,atol)
    elif comparison=="sigfig":
        digits = pl.get_integer_attrib(element,"digits",2)
        eps_digits = pl.get_integer_attrib(element,"eps_digits",3)
        correct = pl.is_correct_ndarray2D_sf(a_sub,a_tru,digits,eps_digits)
    elif comparison=="decdig":
        digits = pl.get_integer_attrib(element,"digits",2)
        eps_digits = pl.get_integer_attrib(element,"eps_digits",3)
        correct = pl.is_correct_ndarray2D_dd(a_sub,a_tru,digits,eps_digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][name] = {"score": 0, "weight": weight}

    return data
