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
  
  # Find dimensions
  robjects.r("set.seed(%s); x = sample(%s, size = %s, replace = TRUE); " % (seed_val, set_size, sample_size))
  
  n_occurrence = robjects.r("n_hits = sum(x == %s)" % (n_obs_num))
  n_prop = robjects.r("n_hits / %s" % (sample_size))

  # Alternatively, we can construct the above in an _R_ function and then call it. 
  #robjects.r('''
  #        sample_r <- function(sample_size, set_size, seed, observed_val) {
  #            set.seed(seed)
  #            x = sample(set_size, size = sample_size, replace = TRUE)
  #            n_hits = sum(x == observed_val)
  #            n_prop = n_hits / sample_size
  #            return(c(n_hits, n_prop))
  #        }
  #        ''')
  # sample_py = robjects.r("sample_r") # Retrieve function
  # vals = sample_py(sample_size, set_size, seed, observed_val)
  #
  # # Unpack data
  # n_occurrence = vals[0]
  # n_prop = vals[1]
  
  # Release data to question
  data["params"]["seed"] = seed_val
  data["params"]["set_size"] = set_size
  data["params"]["sample_size"] = sample_size
  data["params"]["n_obs_num"] = n_obs_num
  
  # Show the correct answers
  # Need to subset to a scalar vector for JSON conversion
  data["correct_answers"]["x_count"] = n_occurrence[0] + 0
  data["correct_answers"]["x_prop"] = n_prop[0] + 0
