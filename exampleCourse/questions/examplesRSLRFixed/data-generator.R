set.seed(8881)

sapply(
  10:13,
  FUN = function(x, df) {
    set.seed(101 + x)
    n_obs = nrow(df)
    my_cars = df[sample(n_obs, size = x),]
    dir.create("clientFilesQuestion", showWarnings = FALSE)
    write.table(
      my_cars,
      file.path("clientFilesQuestion", paste0("highway", x %% 10 + 1, ".csv")),
      row.names = FALSE,
      sep = ","
    )
    TRUE
  },
  df = mtcars
)
