import chevron
import lxml
import prairielearn as pl

def render(element_html: str, data: pl.QuestionData) -> str:
    element = lxml.html.fragment_fromstring(element_html)
    pl.check_attribs(element, [], [])

    # Parse hints from frontend
    hints = []

    for child in element:
        if child.tag == 'pl-hint':
            pl.check_attribs(child, [], ['show-after-submission'])

            # Default show-after-submission to -1 to automatically show hint (closed) at start
            priority = pl.get_integer_attrib(child, 'show-after-submission', -1)
            hints.append((priority, pl.inner_html(child)))

        elif child.tag is lxml.etree.Comment:
            continue
        else:
            raise Exception(f"Tags inside of pl-hidden-hints must be pl-hint, not '{child.tag}'.")

    # Sort hints by priority before displaying
    submission_count = data['num_valid_submissions']
    all_correct = data['score'] == 1.0

    hints_to_display = []

    for idx, (priority, hint) in enumerate(sorted(hints)):
        # Only display a hint if we're above the submission count
        if priority <= submission_count:
            # Close hints once all questions are correct
            show_open = not all_correct and priority == submission_count
            hints_to_display.append({
                'hint': hint,
                'index': idx+1,
                'is_open': show_open
            })

    with open('pl-hidden-hints.mustache', 'r') as f:
        return chevron.render(f, {
            'hints': hints_to_display,
            'is_plural': len(hints_to_display) > 1
        }).strip()
