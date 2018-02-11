import io
import numpy
import random
import rpy2.robjects as robjects
from pandas import DataFrame

def generate(data):
    
    # Get list of data sets in base R
    # val = robjects.r('d = data(package = "datasets")$results[,"Item"]; d[!grepl("[[:space:]]", d)]')
    
    r_datasets = ['PlantGrowth', 'USArrests', 'trees', 'pressure', 'chickwts']
    
    # Pick data set
    ds_id = random.randint(0, len(r_datasets) - 1)
    
    # Get the Data Set Name
    ds_name = r_datasets[ds_id]
    
    # Find dimensions
    ds_dim = robjects.r("dim(get('%s'))" % (ds_name))
    
    # Retrieve individual dimensions
    ds_nrow = ds_dim[0]
    ds_ncol = ds_dim[1]
    
    if ds_nrow > 15:
       ds_nrow = random.randint(6, 15)
    
    # Output Data Table
    data['params']['display_data'] = str(robjects.r("knitr::kable(head(get('%s'), n = %s), align = rep('c', %s), format = 'html', row.names = FALSE)" % 
                                                    (ds_name, ds_nrow, ds_ncol)))

    # Provide data set name
    data['params']['ds_name'] = ds_name
    
    # Simulate some noise
    data['params']['bad_row_lo'] = ds_nrow + random.randint(-8, -1)
    data['params']['bad_row_medium'] = ds_nrow + random.randint(1, 3)
    data['params']['bad_row_high'] = ds_nrow + random.randint(4, 6)
    data['params']['bad_row_highest'] = ds_nrow + random.randint(6, 9)
    
    data['params']['bad_col_lo'] = ds_ncol + random.randint(-2, -1)
    data['params']['bad_col_medium'] = ds_ncol + random.randint(1, 3)
    data['params']['bad_col_high'] = ds_ncol + random.randint(4, 7)
    data['params']['bad_col_highest'] = ds_ncol + random.randint(7, 10)
    
    # Correct dimensions
    data['correct_answers']['ds_nrow'] = ds_nrow
    data['correct_answers']['ds_ncol'] = ds_ncol
