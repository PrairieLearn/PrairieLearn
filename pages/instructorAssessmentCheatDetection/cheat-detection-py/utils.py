def normalize_df(df):
    if df.max()-df.min()!=0:
        return (df-df.min())/(df.max()-df.min()) 
    return df

 # calculate the percentile column based on the rule#n_prob column
def calculate_percentile(col):
    percentile_col = col.copy(deep=True)
    col = col.to_list()
    col.sort(reverse=False)
    for i in range(len(percentile_col)):
        score = percentile_col[i]
        idx = col.index(score)
        percentile_col[i] = 1 - idx/len(percentile_col)
    return percentile_col

def evidence_generator(e1, e2, e3, e4, time_epsilon):
    """ Add more readable instructions to evidence data """
    
    # generate evidence of answering questions at the same time.
    _e1 = "Out of " + str(e1['n_same_questions']) + "same questions, " + str(len(e1['flagged_questions'])) + " questions " + str(["q"+str(int(q)) for q in e1['flagged_questions']]) + " are answered within " + str(time_epsilon) + " seconds time difference. "
    _e2 = "Out of " + str(e2['n_same_questions']) + "same questions, " + str(len(e2['flagged_questions'])) + " questions " + str(["q"+str(int(q)) for q in e2['flagged_questions']]) + " have the identical answer. "
    _e3 = "Out of " + str(e3['n_same_questions']) + "same questions, " + str(e3['flagged_questions']) + " questions are answered in the same order. Answering orders are " + str(e3['stu1_evidence']) + " and " + str(e3['stu2_evidence']) + " respectively."
    _e4 = "Out of " + str(e4['n_same_questions']) + "same questions, " + str(e4['flagged_questions']) + "questions with the same wrong responses are" + str(e4['flagged_questions'])
    return _e1, _e2, _e3, _e4 