import random

def generate(data):

    # Create a list of question prompts and the corresponding answers
    scenarios = [
        {
            "question": "closest",
            "answer": "Mercury",
        },
        {
            "question": "2nd",
            "answer": "Venus",
        },
        {
            "question": "3rd",
            "answer": "Earth",
        },
        {
            "question": "4th",
            "answer": "Mars",
        },
        {
            "question": "5th",
            "answer": "Jupiter",
        },
        {
            "question": "6th",
            "answer": "Saturn",
        }, 
        {
            "question": "7th",
            "answer": "Uranus",
        }, 
        {
            "question": "farthest",
            "answer": "Neptune",
        }
    ]
    
    # Randomize the order of the scenarios
    random.shuffle(scenarios)
    
    # First shuffled scenario is the one we will take as correct
    data['params']['question_prompt'] = scenarios[0]['question']
    data['params']['correct_answer'] = scenarios[0]['answer']

    # Next three shuffled scenarios are the distractors
    data['params']['wrong_answer1'] = scenarios[1]['question']
    data['params']['wrong_answer2'] = scenarios[2]['question']
    data['params']['wrong_answer3'] = scenarios[3]['question']
