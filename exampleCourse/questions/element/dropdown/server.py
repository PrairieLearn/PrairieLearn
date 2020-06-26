import random, copy

def generate(data):

	QUESTION1 = 'aristotle'
	QUESTION2 = 'socrates'
	QUESTION3 = 'hume'

	data['params'][QUESTION1] = [
		{'tag': 'true', 'ans': 'whole'},
		{'tag': 'false', 'ans': 'part'},
		{'tag': 'false', 'ans': 'inverse'}
	]

	return data
	
