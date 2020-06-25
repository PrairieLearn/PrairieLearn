import random

def generate(data):

    # Create a list of question prompts and the corresponding answers
    scenarios = [
        {
            "question": "closest to",
            "answer": "Mercury",
        },
        {
            "question": "2nd away from",
            "answer": "Venus",
        },
        {
            "question": "3rd away from",
            "answer": "Earth",
        },
        {
            "question": "4th away from",
            "answer": "Mars",
        },
        {
            "question": "5th away from",
            "answer": "Jupiter",
        },
        {
            "question": "6th away from",
            "answer": "Saturn",
        }, 
        {
            "question": "7th away from",
            "answer": "Uranus",
        }, 
        {
            "question": "farthest from",
            "answer": "Neptune",
        }
    ]
    
    # Randomize the order of the scenarios
    random.shuffle(scenarios)
    
    # First shuffled scenario is the one we will take as correct
    data['params']['question_prompt'] = scenarios[0]['question']
    data['params']['correct_answer'] = scenarios[0]['answer']

    # Next three shuffled scenarios are the distractors
    data['params']['wrong_answer1'] = scenarios[1]['answer']
    data['params']['wrong_answer2'] = scenarios[2]['answer']
    data['params']['wrong_answer3'] = scenarios[3]['answer']
