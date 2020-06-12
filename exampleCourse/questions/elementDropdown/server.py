import random, copy

def generate(data):

	QUESTION1 = 'aristotle'
	QUESTION2 = 'hume'
	QUESTION3 = 'socrates'

	# Can override pl-answer options as parameters
	data['params'][QUESTION1] = { 
		'tag1': 'true', 'ans1': 'whole', 
		'tag2': 'false', 'ans2': 'part',
		'tag3': 'false', 'ans3': 'inverse' 
	}

	data['params'][QUESTION2] = {
		'tag1': 'true', 'ans1': 'insatiable',
		'tag2': 'false', 'ans2': 'unexamined',
		'tag3': 'false', 'ans3': 'examined' 
	}

	data['params'][QUESTION3] = {
		'tag1': 'true', 'ans1': 'wise',
		'tag2': 'false', 'ans2': 'clumsy',
		'tag3': 'false', 'ans3': 'reckless'
	}

	return data