#import pandas as pd
from collections import OrderedDict


class Times(object):
    def __init__(self, student):
        self.student = student
        self.q_times = OrderedDict()
        self.student_answer = {}
        self.student_question = [] 

    def set_time_answer(self, question, s_question, start_time, end_time, response):
        # TO DO: IF QUESTION IN ordered dict, do nothing. THEN REVERSE DICT AT THE END
        # Check that start and end times are valid (start < end)
        # When overriding, make sure old start/end < new start/end
        if question in self.q_times:
            # Checks if new start/end time are after the old ones
            if self.q_times[question][1] > start_time:
                return
            self.q_times.pop(question)
            self.student_question.remove(s_question) #removing is linear time right now (unideal)
        if start_time <= end_time:      
            self.q_times[question] = (start_time, end_time)  # use tuple
        self.student_answer[question] = response
        self.student_question.append(s_question)
    
        # def reverse_ordered_dict():
        # Reverse an existing dict tempdict
                #OrderedDict(reversed(list(tempdict.items())))

    def __printDicts__(self):
        print("Time object for " + self.student + ":")
        print("Ordered Dict: ")
        print(self.q_times)
        print("Responses: ")
        print(self.student_answer)
