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

	data['params'][QUESTION2] = [
		{'tag': 'false', 'ans': 'insatiable'},
		{'tag': 'true', 'ans': 'unexamined'},
		{'tag': 'false', 'ans': 'examined' }
	]

	data['params'][QUESTION3] = [
		{'tag': 'true', 'ans': 'wise'},
		{'tag': 'false', 'ans': 'clumsy'},
		{'tag': 'false', 'ans': 'reckless'}
	]

	return data
	
