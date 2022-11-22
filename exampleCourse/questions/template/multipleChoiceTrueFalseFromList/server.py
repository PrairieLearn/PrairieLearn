import random

def generate(data):

    # Create a list of question prompts and the corresponding answers
    scenarios = [
        {
            "question": "North",
            "answer": True,
        },
        {
            "question": "South",
            "answer": False,
        },
        {
            "question": "West",
            "answer": False,
        },
        {
            "question": "East",
            "answer": False,
        }
    ]
    
    # Randomize the order of the scenarios
    random.shuffle(scenarios)
    
    # First shuffled scenario is the one we will take as correct
    data['params']['question_prompt'] = scenarios[0]['question']

    # Depending on the truth statement, set the appropriate answer.
    data['params']['true_answer'] = scenarios[0]['answer']
    data['params']['false_answer'] = not scenarios[0]['answer']
