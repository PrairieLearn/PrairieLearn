import random, copy

def generate(data):

	# Can override pl-answer solution 
	data['correct_answers']['aristotle'] = 'whole'
	data['correct_answers']['hume'] = 'wise'
	data['correct_answers']['socrates'] = 'unexamined'

	# Can override pl-answer options as parameters
	data['params']['aristotle'] = ['whole', 'part', 'inverse']
	data['params']['socrates'] = ['insatiable', 'unexamined', 'examined']
	data['params']['hume'] = ['wise', 'clumsy', 'reckless']

