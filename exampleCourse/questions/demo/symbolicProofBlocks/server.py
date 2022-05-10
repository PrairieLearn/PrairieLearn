plob = __import__("pl-order-blocks")

tag_to_boxes = {
    '2': ['closed_form'],
    '3': ['base_right', 'base_left']
}

def generate(data):
    data['correct_answers']['closed_form'] = 'n / (n + 1)'
    data['correct_answers']['base_left'] = '1/2'
    data['correct_answers']['base_right'] = '1/2'

def grade(data):
    # print(data['partial_scores'])
    plob.grade('sum-closed-form', data, tag_to_boxes)