import chevron
import lxml.html
import prairielearn as pl
import random

# Functions specific to this element

def answers_name(element_html):
    element = lxml.html.fragment_fromstring(element_html)  # Convert the html from a string to an lxml.html.HtmlElement object    
    return pl.get_string_attrib(element, 'answers-name')   # The question element in the question.html file should have an attribute called 'answers-name'; get the value of that attribute.

def answers_weight(element_html):
    weight_default = 1
    element = lxml.html.fragment_fromstring(element_html)  # Convert the html from a string to an lxml.html.HtmlElement object    
    return pl.get_integer_attrib(element, 'weight', weight_default) # The question element may have a weight. Get the weight, or a default if there isn't one.



# Functions defined by PrairieLearn

def prepare(element_html, data):
    data['params']['random_number'] = random.randint(0,9)
    data["correct_answers"][answers_name(element_html)] = int(data['params']['random_number'])
    return data


def render(element_html, data):

    name = answers_name(element_html)  

    with open('clickable-image.mustache', 'r') as f:

        if data['panel'] == 'question':
            html_params = {
                'question': True,                                                          # This boolean parameter is needed to let the mustache file know to render the html between {{#question}} and {{/question}}
                'number': data['params']['random_number'],                                 # This parameter is accessible from the mustache file as {{number}}
                'answers_name': name,                                                      # This parameter is accessible from the mustache file as {{answers_name}}
                'image_url': data['options']['client_files_element_url'] + '/block_i.png'  # This parameter is accessible from the mustache file as {{image_url}}
            }
            return chevron.render(f, html_params).strip()                                  # This line renders the mustache file into the actual HTML snippet for the Question panel.
                                                                                           #   Alternatively, this method could have dynamically created the HTML string and returned it without using a mustache file.

        elif data['panel'] == 'submission':
            feedback = data['partial_scores'][name].get('feedback', None)
            if feedback:
                html_params = {
                    'submission': True,                                                    # This boolean parameter is needed to let the mustache file know to render the html between {{#submission}} and {{/submission}}
                    'provide_feedback': True,                                              # This boolean parameter is needed to let the mustache file know to render the html between {{#provide_feedback}} and {{/feedback}}
                    'feedback': feedback,                                                  # This parameter is accessible from the mustache file as {{feedback}}
                    'submitted': data["raw_submitted_answers"][name]                       # This parameter is accessible from the mustache file as {{submitted}}
                }
            else:
                html_params = {
                    'submission': True,                                                    # This boolean parameter is needed to let the mustache file know to render the html between {{#submission}} and {{/submission}}
                    'provide_feedback': False,                                             # This boolean parameter is needed to let the mustache file know not to render the html between {{#provide_feedback}} and {{/feedback}}
                    'submitted': data["raw_submitted_answers"][name]                       # This parameter is accessible from the mustache file as {{submitted}}
                }
            return chevron.render(f, html_params).strip()                                  # This line renders the mustache file into the actual HTML snippet for the Submitted Answer panel.
                                                                                           #   Alternatively, this method could have dynamically created the HTML string and returned it without using a mustache file.

        elif data['panel'] == 'answer':
            html_params = {
                'answer': True,                                                            # This boolean parameter is needed to let the mustache file know to render the html between {{#answer}} and {{/answer}}
                'correct': data["correct_answers"][name]                                   # This parameter is accessible from the mustache file as {{correct}}
            }                       
            return chevron.render(f, html_params).strip()                                  # This line renders the mustache file into the actual HTML snippet for the Correct Answer panel.
                                                                                           #   Alternatively, this method could have dynamically created the HTML string and returned it without using a mustache file.

        

def parse(element_html, data):
    name = answers_name(element_html)
    data["submitted_answers"][name] = int(data["raw_submitted_answers"][name])
    return data
    
def grade(element_html, data):
    name = answers_name(element_html)
    weight = answers_weight(element_html)

    if data["submitted_answers"][name] == data["correct_answers"][name]:
        data['partial_scores'][name] = {'score': 1, 'weight': weight}
    elif data["submitted_answers"][name] + 1 == data["correct_answers"][name]:
        data['partial_scores'][name] = {'score': 0.75, 'weight': weight, 'feedback': 'Your number was one too small.'}
    elif data["submitted_answers"][name] - 1 == data["correct_answers"][name]:
        data['partial_scores'][name] = {'score': 0.5, 'weight': weight, 'feedback': 'Your number was one too large.'}
    else:
        data['partial_scores'][name] = {'score': 0, 'weight': weight, 'feedback': "You didn't click on the image the correct number of times"}

    return data


