

def generate(data):
    data['correct_answers']['closed_form'] = 'n / (n + 1)'
    data['correct_answers']['base_left'] = '1/2'
    data['correct_answers']['base_right'] = '1/2'

def grade(data):
    print(data['partial_scores'])