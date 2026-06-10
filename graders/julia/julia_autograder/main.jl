include(joinpath(@__DIR__, "src", "PrairieLearnJuliaAutograder.jl"))

using .PrairieLearnJuliaAutograder

PrairieLearnJuliaAutograder.run_autograder()
