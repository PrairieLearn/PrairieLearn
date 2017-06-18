import numpy as np
import psycopg2

conn = psycopg2.connect("dbname=postgres user=psud")

n = 100
quintile_means = [[0 for x in range(100)] for y in range(5)]
for i in range(n):
    cur = conn.cursor()
    cur.callproc('get_quintile_stats_num_reps', [100])
    (means, sds, assessment_id) = cur.fetchone()

    print(means)
    for j in range(5):
        quintile_means[j][i] = means[j]
    cur.close()

sds = [0 for x in range(5)]
for i in range(5):
    sds[i] = np.std(quintile_means[i])

conn.close()
print(sds)
