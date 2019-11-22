import rpy2.robjects as robjects
import prairielearn as pl
import numpy as np

def generate(data):
   
  values = robjects.r('''
  # Pick a pre-made data set
  id = sample(4, size = 1)

  # Read in the data
  my_data = read.csv(paste0('./clientFilesQuestion/highway', id,'.csv'))

  # Form a model
  lm_model = lm(mpg ~ hp, data = my_data)

  beta_hats = coef(lm_model)

  # Export
  list(params = list(highway_id = id),
       ans    = list(beta0 = beta_hats[1],
                     beta1 = beta_hats[2])
       )
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
