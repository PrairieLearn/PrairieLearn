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

    df = knitr::kable(head(df_picked, ds_nrow),
                 align = rep('c', ds_ncol), format = 'html', row.names = FALSE)

    list(params = list(display_data = df, 
                       bad_row_low = ds_nrow + sample(-8:-1, 1),
                       bad_row_medium = ds_nrow + sample(1:3, 1),
                       bad_row_high = ds_nrow + sample(4:6, 1),
                       bad_row_highest = ds_nrow + sample(6:9, 1),
                       bad_col_low = ds_ncol + sample(-2:-1, 1), 
                       bad_col_medium = ds_ncol + sample(1:3, 1),
                       bad_col_high = ds_ncol + sample(4:7, 1), 
                       bad_col_highest = ds_ncol + sample(7:10, 1)),
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
    
