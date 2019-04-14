import psycopg2

conn = psycopg2.connect("dbname=paras user=paras")

assessment_id = 451364
user_id = 4434
authn_user_id = user_id
enum_mode = 'Exam'
num_sds = 0.9
output_file_path = '/mnt/c/Users/Paras/PrairieLearn/code2/output/from_python_script.txt'

cur = conn.cursor()
cur.execute('LISTEN test;')
cur.execute('UPDATE assessments AS a SET multiple_instance = true WHERE a.id=%s', [assessment_id])
cur.execute('UPDATE assessments AS a SET generated_assessment_sd_reduction_feature_enabled = true WHERE a.id=%s', [assessment_id])
cur.execute('UPDATE assessments AS a SET num_sds = %s WHERE a.id=%s', [num_sds, assessment_id])
conn.commit()
cur.close()


class ListWrapper:
    def __init__(self):
        self.internal_list = []

    def append(self, el):
        self.internal_list.append(el)

    def __iter__(self):
        return self.internal_list.__iter__()

    def clear(self):
        self.internal_list = []


conn.notices = ListWrapper()

with open(output_file_path, 'w') as f:
    n = 1000
    for i in range(n):
        print(str(100 * i / n) + '% done')
        cur = conn.cursor()
        cur.callproc('assessment_instances_insert', [assessment_id, user_id, authn_user_id, enum_mode])
        # but don't commit!
        cur.close()
        for notice in conn.notices:
            notice_cleaned = notice[9:-1]
            f.write(notice_cleaned + '\n')
        conn.notices.clear()

conn.close()
