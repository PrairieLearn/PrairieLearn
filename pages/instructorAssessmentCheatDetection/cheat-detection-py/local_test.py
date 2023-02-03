from students_map import CheatingDetection
import sys
import os
import argparse




files = ["fa20E2cleanedOutput" + '/' + f for f in os.listdir("fa20E2cleanedOutput")]

a = CheatingDetection(files, "./", {"CHECK_TIME_time_epsilon": 60,
                         "RULE1_TIME_WEIGHT": 0.3, 
                         "RULE2_ANSWER_WEIGHT": 0.4, 
                         "RULE3_ORDER_WEIGHT": 0.3} )
a.process_data()
student1 = a.map[123]
student2 = a.map[247]
print(a.check_same_wrong_answer(student1, student2))






