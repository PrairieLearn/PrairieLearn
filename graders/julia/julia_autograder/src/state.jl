const CURRENT_STATE = Ref{Any}(nothing)
const CURRENT_CONTEXT = Ref{Any}(nothing)
const CURRENT_NAME_STACK = Ref(String[])
const REGISTERING = Ref(false)
const REGISTERED_SPECS = Ref(Any[])
const CURRENT_SOURCE_FILE = Ref("")
const SetupModule = Module(:SetupModule)

Base.@kwdef mutable struct RunConfig
  results_file::String
  run_dir::String
  tests_dir::String
  generated_dir::String
  student_dir::String
  data_dir::String
  student_file::String = "student.jl"
  answer_file::String = "answer.jl"
  setup_file::String = "setup.jl"
  manifest_file::String = "manifest.toml"
end

Base.@kwdef mutable struct TestSpec
  name::String
  description::String = ""
  points::Float64 = 1.0
  repeats::Int = 1
  mode::Symbol = :macro
  source_file::String = ""
end

Base.@kwdef mutable struct TestContext
  spec::TestSpec
  iteration::Int = 1
  assertions::Int = 0
  failed::Bool = false
  score_override::Union{Nothing,Float64} = nothing
  messages::Vector{String} = String[]
  output::String = ""
end

Base.@kwdef mutable struct RunState
  config::RunConfig
  data::Any
  setup_module::Module
  student::Module
  reference::Module
  results::Vector{Dict{String, Any}} = Dict{String, Any}[]
  generated_manifest::Vector{Dict{String, Any}} = Dict{String, Any}[]
  source_files::Vector{String} = String[]
  wrapper_texts::Vector{Tuple{String, String}} = Tuple{String, String}[]
  source_spec_map::Dict{String, Vector{TestSpec}} = Dict{String, Vector{TestSpec}}()
end

function current_state()::RunState
  state = CURRENT_STATE[]
  state === nothing && error("Autograder state has not been initialized.")
  return state
end

function current_context()::TestContext
  ctx = CURRENT_CONTEXT[]
  ctx === nothing && error("This helper must be called from inside a Julia grader test body.")
  return ctx
end

function current_name_path()::String
  stack = CURRENT_NAME_STACK[]
  isempty(stack) && return ""
  return join(stack, " / ")
end

function push_name!(name::AbstractString)
  push!(CURRENT_NAME_STACK[], String(name))
end

function pop_name!()
  pop!(CURRENT_NAME_STACK[])
end

function reset_registration!()
  empty!(REGISTERED_SPECS[])
  REGISTERING[] = false
  CURRENT_SOURCE_FILE[] = ""
end

function register_spec!(spec::TestSpec)
  push!(REGISTERED_SPECS[], spec)
  return spec
end

function normalize_json_value(value)
  if value isa JSON3.Object
    return Dict(String(k) => normalize_json_value(v) for (k, v) in pairs(value))
  elseif value isa AbstractDict
    return Dict(String(k) => normalize_json_value(v) for (k, v) in pairs(value))
  elseif value isa JSON3.Array || value isa AbstractVector
    return [normalize_json_value(v) for v in value]
  else
    return value
  end
end

function json_value_expr(value)
  if value === nothing
    return :(nothing)
  elseif value isa Bool
    return value ? :(true) : :(false)
  elseif value isa Integer || value isa AbstractFloat
    return value
  elseif value isa AbstractString
    return QuoteNode(String(value))
  elseif value isa AbstractVector
    return Expr(:vect, (json_value_expr(v) for v in value)...)
  elseif value isa AbstractDict
    pair_exprs = [:( $(json_value_expr(String(k))) => $(json_value_expr(v)) ) for (k, v) in pairs(value)]
    return Expr(:call, :Dict, pair_exprs...)
  else
    return QuoteNode(value)
  end
end

function stable_seed(parts::AbstractString...)
  seed = UInt64(0xcbf29ce484222325)
  for part in parts
    for byte in codeunits(part)
      seed = xor(seed, UInt64(byte))
      seed *= UInt64(0x100000001b3)
    end
  end
  return Int(mod(seed, UInt64(typemax(Int))))
end
