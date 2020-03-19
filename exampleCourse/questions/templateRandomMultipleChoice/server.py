import random

def generate(data):

    # Create a list of planets and their order
    scenarios = [
        {
            "name": "Mercury",
            "order": "closest"
        },
        {
            "name": "Venus",
            "order": "2nd"
        },
        {
            "name": "Earth",
            "order": "3rd"
        },
        {
            "name": "Mars",
            "order": "4th"
        },
        {
            "name": "Jupiter",
            "order": "5th"
        },
        {
            "name": "Saturn",
            "order": "6th"
        }, 
        {
            "name": "Uranus",
            "order": "7th"
        }, 
        {
            "name": "Neptune",
            "order": "farthest"
        }
    ]
    
    # Randomly pick one scenario
    active_scenario = random.choice(scenarios)
    correct_scenario_name = active_scenario['name']
    
    # Obtain all data structure names
    scenario_names = [entry['name'] for entry in scenarios]

    # Remove correct answer name from list.
    scenario_names.remove(correct_scenario_name)

    # Randomize distractor scenarios
    random.shuffle(scenario_names)
    
    # Store customized prompt
    data['params']['custom_prompt'] = active_scenario['order']
    
    # Select three distractors
    data['params']['wrong_scenario1'] = scenario_names[0]
    data['params']['wrong_scenario2'] = scenario_names[1]
    data['params']['wrong_scenario3'] = scenario_names[2]

    # Store the correct scenario
    data['params']['correct_scenario'] = correct_scenario_name