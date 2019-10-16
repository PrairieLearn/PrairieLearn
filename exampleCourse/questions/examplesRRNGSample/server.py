import random
import rpy2.robjects as robjects

def generate(data):

  # Pick a seed
  seed_val = random.randint(1000, 9999)

  # Pick number of obs to generate
  set_size = random.randint(18, 24)
  
  # Pick number to count
  n_obs_num = random.randint(1, set_size)
  
  # Pick number of obs to generate
  sample_size = random.randint(101, 250)
  
  # Constructing an _R_ function with the sampling procedure
  robjects.r('''
          sample_r <- function(sample_size, set_size, seed, n_obs_num) {
              set.seed(seed)
              x = sample(set_size, size = sample_size, replace = TRUE)
              n_hits = sum(x == n_obs_num)
              n_prop = n_hits / sample_size
              return(c(n_hits, n_prop))
          }
          ''')

  # Retrieve function
  sample_py = robjects.r("sample_r") 
  
  # Calling the function and obtained results
  vals = sample_py(sample_size, set_size, seed_val, n_obs_num)
  
  # Unpack data
  n_occurrence = vals[0]
  n_prop = vals[1]
  
  # Release data to question
  data["params"]["seed"] = seed_val
  data["params"]["set_size"] = set_size
  data["params"]["sample_size"] = sample_size
  data["params"]["n_obs_num"] = n_obs_num
  
  # Show the correct answers
  data["correct_answers"]["x_count"] = n_occurrence
  data["correct_answers"]["x_prop"] = n_prop
