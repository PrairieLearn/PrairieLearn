import lxml.html
from html import escape
import prairielearn as pl

def prepare(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    true_answer = pl.get_float_attrib(element, "true_answer", None)
    if true_answer is not None:
        if name in data["true_answer"]:
            raise Exception("duplicate true_answer variable name: %s" % name)
        data["true_answer"][name] = true_answer

    return data

def render(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")
    label = pl.get_string_attrib(element,"label",None)
    display = pl.get_string_attrib(element,"display","inline")

    if options["panel"] == "question":
        editable = options["editable"]
        raw_submitted_answer = options["raw_submitted_answer"].get(name, None)

        # Create info string
        info = 'Your answer must be a single number. ' \
            + 'No symbolic expressions (those that involve fractions, ' \
            + 'square roots, variables, etc.) will be accepted. Scientific ' \
            + 'notation is accepted (e.g., 1.2e03). '
        # Get method of comparison, with relabs as default
        comparison = pl.get_string_attrib(element, "comparison","relabs")
        # Get comparison parameters and add comparison-specific message to info string
        if comparison=="relabs":
            rtol = pl.get_float_attrib(element,"rtol",1e-5)
            atol = pl.get_float_attrib(element,"atol",1e-8)
            info += 'Your answer must be accurate' \
                + ' to within relative tolerance ' + ('%g' % rtol) \
                + ' and absolute tolerance ' + ('%g' % rtol) + '.'
        elif comparison=="sigfig":
            digits = pl.get_integer_attrib(element,"digits",2)
            info += 'Your answer must be accurate' \
                + ' to ' + ('%d' % digits) + ' significant figures.'
        elif comparison=="decdig":
            digits = pl.get_integer_attrib(element,"digits",2)
            info += 'Your answer must be accurate' \
                + ' to ' + ('%d' % digits) + ' digits after the decimal.'
        else:
            raise ValueError('method of comparison "%s" is not valid (must be "relabs", "sigfig", or "decdig")' % comparison)

        # Put javascript in html to enable popovers
        # FIXME: enable popovers someplace else
        html = '''<style>\n    .popover{max-width: 50%;}\n</style>\n\n'''
        html += '''<script>\n''' \
            + '''    $(document).ready(function(){\n''' \
            + '''        $('[data-toggle="popover"]').popover({container: 'body'});\n''' \
            + '''    });\n''' \
            + '''</script>\n\n'''

        if display == "inline":
            html += '''<span class="form-inline"><span class="input-group">\n'''
            html += '''    <input name="'''+name+'''" type="text" class="form-control" ''' \
                + ('' if editable else ' disabled') \
                + ('' if (raw_submitted_answer is None) else (' value="' + escape(raw_submitted_answer) + '" ')) \
                + '''aria-describedby="basic-addon1" />\n''' \
                + '''    <span class="input-group-btn" id="basic-addon1">\n''' \
                + '''        <a class="btn btn-default" type="button" data-toggle="popover" title="Number" data-content="'''+info+'''" data-placement="auto left" data-trigger="focus" tabindex="0">\n''' \
                + '''            <i class="fa fa-question-circle" aria-hidden="true"></i>\n''' \
                + '''        </a>\n''' \
                + '''    </span>\n''' \
                + '''</span></span>'''
        elif display == "block":
            html += '''<div class="input-group">\n'''
            if label is not None:
                html += '''    <label class="input-group-addon" id="basic-addon2">'''+label+'''</label>\n'''
            html += '''    <input name="'''+name+'''" type="text" class="form-control" ''' \
                + ('' if editable else ' disabled') \
                + ('' if (raw_submitted_answer is None) else (' value="' + escape(raw_submitted_answer) + '" ')) \
                + '''aria-describedby="basic-addon1" />\n''' \
                + '''    <span class="input-group-btn" id="basic-addon1">\n''' \
                + '''        <a class="btn btn-default" type="button" data-toggle="popover" title="Number" data-content="'''+info+'''" data-placement="auto left" data-trigger="focus" tabindex="0">\n''' \
                + '''            <i class="fa fa-question-circle" aria-hidden="true"></i>\n''' \
                + '''        </a>\n''' \
                + '''    </span>\n''' \
                + '''</div>'''
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline", "block", or "display")' % display)
    elif options["panel"] == "submission":
        submitted_answer = data["submitted_answer"].get(name, None)
        parse_error = data["parse_errors"].get(name, None)

        if display=="inline":
            if parse_error is not None:

                # Put javascript in html to enable popovers
                # FIXME: enable popovers someplace else
                html = '''<style>\n    .popover{max-width: 50%;}\n</style>\n\n'''
                html += '''<script>\n''' \
                    + '''    $(document).ready(function(){\n''' \
                    + '''        $('[data-toggle="popover"]').popover({container: 'body'});\n''' \
                    + '''    });\n''' \
                    + '''</script>\n\n'''

                html += '''<a class="btn btn-default" type="button" ''' \
                    + '''data-placement="auto" data-trigger="focus" ''' \
                    + '''data-toggle="popover" title="Error" tabindex="0" ''' \
                    + '''data-content="'''+parse_error+'''">INVALID ''' \
                    + '''<span><i class="fa fa-question-circle" aria-hidden="true"></i></span></a>'''
            else:
                html = "%.12g" % submitted_answer
        elif display=="block":
            label = pl.get_string_attrib(element,"label",None)
            if parse_error is not None:
                html = '''<div style="display: flex; align-items: center;">\n'''
                if label is not None:
                    html += '''    <span style="white-space:nowrap;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+label+'''</span>\n'''
                html += '''    <pre style="flex:1;width:50%;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;"><strong>INVALID&nbsp;...&nbsp;</strong>'''+parse_error+'''</pre>\n''' \
                    + '''</div>'''
            else:
                # Get submitted answer or throw exception if it does not exist
                a_sub = data["submitted_answer"][name]

                html = '''<div style="display: flex; align-items: center;">\n'''
                if label is not None:
                    html += '''    <span style="white-space:nowrap;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+label+'''</span>\n'''
                html += '''    <pre style="flex:1;width:50%;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">{:.12g}</pre>\n</div>'''.format(a_sub)
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline", "block", or "display")' % display)
    elif options["panel"] == "answer":
        a_tru = data["true_answer"].get(name, None)

        if display=="inline":
            if a_tru is None:
                html = ""
            else:
                html = '{:.12g}'.format(a_tru)
        elif display=="block":
            label = pl.get_string_attrib(element,"label",None)
            if a_tru is None:
                html = ""
            else:
                # FIXME: render correctly with respect to method of comparison

                html = '''<div style="display: flex; align-items: center;">\n'''
                if label is not None:
                    html += '''    <span style="white-space:nowrap;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;">'''+label+'''</span>\n'''
                html += '''    <pre style="flex:1;width:50%;padding: 9.5px;margin: 0 0 10px;box-sizing: border-box;"> {:.12g} </pre>\n</div>'''.format(a_tru)
        else:
            raise ValueError('method of display "%s" is not valid (must be "inline", "block", or "display")' % display)
    else:
        raise Exception("Invalid panel type: %s" % options["panel"])

    return html

def parse(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get submitted answer or return parse_error if it does not exist
    a_sub = data["submitted_answer"].get(name,None)
    if not a_sub:
        data["parse_errors"][name] = 'No submitted answer.'
        data["submitted_answer"][name] = None
        return data

    try:
        data["submitted_answer"][name] = float(a_sub)
    except ValueError:
        data["parse_errors"][name] = "Invalid format (not a real number)."
        data["submitted_answer"][name] = None

    return data

def grade(element_html, element_index, data, options):
    element = lxml.html.fragment_fromstring(element_html)
    name = pl.get_string_attrib(element, "name")

    # Get weight
    weight = pl.get_integer_attrib(element, "weight", 1)

    # sig_figs = pl.get_integer_attrib(element, "sig_figs", 3)
    # # FIXME: add rtol/atol/dec_places
    #
    # submitted_answer = data["submitted_answer"].get(name, None)
    # true_answer = data["true_answer"].get(name, None)
    #
    # score = 0
    # if (submitted_answer is not None and submitted_answer == true_answer):
    #     score = 1
    #
    # data["partial_scores"][name] = {"score": score, "weight": weight}


    # Get true answer (if it does not exist, create no grade - leave it
    # up to the question code)
    a_tru = data["true_answer"].get(name,None)
    if a_tru is None:
        return data

    # Get submitted answer (if it does not exist, score is zero)
    a_sub = data["submitted_answer"].get(name,None)
    if a_sub is None:
        data["partial_scores"][name] = {"score": 0, "weight": weight}
        return data
    
    # Get method of comparison, with relabs as default
    comparison = pl.get_string_attrib(element, "comparison","relabs")

    # Compare submitted answer with true answer
    if comparison=="relabs":
        rtol = pl.get_float_attrib(element,"rtol",1e-5)
        atol = pl.get_float_attrib(element,"atol",1e-8)
        correct = pl.is_correct_scalar_ra(a_sub,a_tru,rtol,atol)
    elif comparison=="sigfig":
        digits = pl.get_integer_attrib(element,"digits",2)
        eps_digits = pl.get_integer_attrib(element,"eps_digits",3)
        correct = pl.is_correct_scalar_sf(a_sub,a_tru,digits,eps_digits)
    elif comparison=="decdig":
        digits = pl.get_integer_attrib(element,"digits",2)
        eps_digits = pl.get_integer_attrib(element,"eps_digits",3)
        correct = pl.is_correct_scalar_dd(a_sub,a_tru,digits,eps_digits)
    else:
        raise ValueError('method of comparison "%s" is not valid' % comparison)

    if correct:
        data["partial_scores"][name] = {"score": 1, "weight": weight}
    else:
        data["partial_scores"][name] = {"score": 0, "weight": weight}









    return data
