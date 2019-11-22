# Enable R computation
import rpy2.robjects as robjects

def generate(data):
    
    # Get list of data sets in base R  
   
    values = robjects.r('''
    # Get list of data sets in base R  
    datasets = c('CO2', 'attitude', 'USJudgeRatings', 'pressure', 'warpbreaks', 'esoph', 'ToothGrowth')
    
    # Choose a data set
    ds_name = sample(datasets, size = 1)

    # Retrieve the data set
    df_picked = get(ds_name)

    # Obtain the dimensions
    df_dim = dim(df_picked)

    ds_nrow = df_dim[1]
    ds_ncol = df_dim[2]

    # Cap observation number
    if(ds_nrow > 15) {
       ds_nrow = 15
    }

    # Compute distractors    
    gen_distractor_discrete = function(number_answers, true_answer, min_gap = 1, max_gap = 4) {
      # Generate distinct random answer offsets from random gaps between answers
      gaps = sample(min_gap:max_gap, size = number_answers, replace = TRUE)
      offsets = cumsum(gaps)
      
      # Choose one of the answers to be the true answer
      true_answer_index = sample(number_answers, 1)
      
      # Offset of the true answer from the smallest answer
      true_answer_offset = offsets[true_answer_index]
      
      # Calculate the answers by computing the offsets from the known true answer
      answers = true_answer + offsets - true_answer_offset
      
      # Eliminate the true answer from the answers array to get just the distractors
      distractors = answers[-true_answer_index]
      
      return(distractors)
    }

    # Number of answers
    n_answers = 5

    # Generate distractors (n_answers - 1) 
    bad_row = as.list(gen_distractor_discrete(n_answers, ds_nrow))
    bad_col = as.list(gen_distractor_discrete(n_answers, ds_ncol), 1, 2)

    # Name distractors
    names(bad_row) = paste0("bad_row_val", seq_len(n_answers - 1))
    names(bad_col) = paste0("bad_col_val", seq_len(n_answers - 1))

    df = knitr::kable(head(df_picked, ds_nrow),
                 align = rep('c', ds_ncol), format = 'html', row.names = FALSE)

    list(params = c(list(display_data = df), bad_row, bad_col),
         ans    = list(ds_nrow = ds_nrow, ds_ncol = ds_ncol))
    ''')

    # Extract parameter and answer lists
    par = values[0]
    ans = values[1]

    # Convert from R lists to python dictionaries
    par = { key : par.rx2(key)[0] for key in par.names }
    ans = { key : ans.rx2(key)[0] for key in ans.names }

    # Setup output dictionaries
    data['params'] = par
    data['correct_answers'] = ans
    
