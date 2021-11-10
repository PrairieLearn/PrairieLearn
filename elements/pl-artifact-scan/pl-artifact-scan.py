import prairielearn as pl
import lxml.html
import chevron

BARCODE = '_pl_artifact_barcode'
BLANK_ANSWER = ''
REQUIRED = 'required'
REQUIRED_DEFAULT = True


def prepare(element_html, data):
    lxml.html.fragment_fromstring(element_html)


def render(element_html, data):
    uuid = pl.get_uuid()

    if data['panel'] == 'question':
        html_params = {
            'question': True,
            'uuid': uuid,
        }
    else:
        html_params = {
            'uuid': uuid,
            'question': False,
            'parse-error': data['format_errors'].get(BARCODE, None),
            'barcode': data['submitted_answers'].get(BARCODE)
        }

    with open('pl-artifact-scan.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    submitted_barcode = data['submitted_answers'].get(BARCODE, '').strip()
    required = pl.get_boolean_attrib(element, REQUIRED, REQUIRED_DEFAULT)

    # TO DO: Figure out logic for if we need more barcodes per instance question submission.
    # ie. Student submits two pieces of paper to be scanned.
    # See line 12 of pl-artifact-scan.mustache
    del data['submitted_answers'][BARCODE]

    data['submitted_answers'][BARCODE] = submitted_barcode

    if submitted_barcode != '' and submitted_barcode.isnumeric() is False:
        data['format_errors'][BARCODE] = 'Barcode "' + submitted_barcode + '" is not a valid number.'
    elif len(submitted_barcode) != 13:
        data['format_errors'][BARCODE] = 'Barcode must be 13 digits.'
    elif submitted_barcode is BLANK_ANSWER and required is True:
        data['format_errors'][BARCODE] = 'Submitting your work is required for this question. Submit the barcode attached to your written work.'
