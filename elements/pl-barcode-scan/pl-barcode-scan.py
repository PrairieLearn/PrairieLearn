import prairielearn as pl
import lxml.html
import chevron

BARCODE = '_pdf_barcode_scan'
BLANK_ANSWER = ''
REQUIRED = 'required'
REQUIRED_DEFAULT = True


def crc16arc(msg):
    """
    CRC-16/ARC
    This algorithm has to match the 'js-crc' npm algorithm, which was assumed to be the same as this.
    https://stackoverflow.com/questions/63167168/trying-to-find-the-input-for-crc16-ibm
    """
    crc = 0
    for b in msg:
        crc ^= b
        for _ in range(8):
            crc = (crc >> 1) ^ 0xa001 if crc & 1 else crc >> 1
    return crc


def is_invalid_barcode(barcode):
    barcode = barcode.lower()
    sha16 = barcode[len(barcode) - 4:len(barcode)]
    base36 = barcode.replace(sha16, '')
    recomputed_sha16 = hex(crc16arc(bytes(base36, encoding='utf-8')))
    if sha16 in recomputed_sha16:
        return False
    else:
        return True


def prepare(element_html, data):
    lxml.html.fragment_fromstring(element_html)


def render(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    required = pl.get_boolean_attrib(element, REQUIRED, REQUIRED_DEFAULT)
    uuid = pl.get_uuid()

    if data['panel'] == 'question':
        html_params = {
            'question': True,
            'uuid': uuid,
            'required': required
        }
    else:
        html_params = {
            'uuid': uuid,
            'question': False,
            'parse-error': data['format_errors'].get(BARCODE, None),
            'barcode': data['submitted_answers'].get(BARCODE)
        }

    with open('pl-barcode-scan.mustache', 'r', encoding='utf-8') as f:
        html = chevron.render(f, html_params).strip()
    return html


def parse(element_html, data):
    element = lxml.html.fragment_fromstring(element_html)
    submitted_barcode = data['submitted_answers'].get(BARCODE, '').strip()
    required = pl.get_boolean_attrib(element, REQUIRED, REQUIRED_DEFAULT)

    # TO DO: Figure out logic for if we need more barcodes per instance question submission.
    # ie. Student submits two pieces of paper to be scanned.
    del data['submitted_answers'][BARCODE]

    data['submitted_answers'][BARCODE] = submitted_barcode

    if isinstance(submitted_barcode, str) is not True:
        data['format_errors'][BARCODE] = 'Barcode is not a valid string'
        return

    if submitted_barcode != '' and is_invalid_barcode(submitted_barcode):
        data['format_errors'][BARCODE] = 'Barcode "' + submitted_barcode + '" is invalid.'
    elif submitted_barcode is BLANK_ANSWER and required is True:
        data['format_errors'][BARCODE] = 'A barcode associated with your written work MUST be submitted for this question!'
