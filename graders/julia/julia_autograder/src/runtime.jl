function config_from_environment(run_dir::AbstractString)
  results_file = read(joinpath(run_dir, "output-fname.txt"), String)
  delete_file_if_exists(joinpath(run_dir, "output-fname.txt"))
  return RunConfig(
    results_file = results_file,
    run_dir = String(run_dir),
    tests_dir = joinpath(run_dir, "tests"),
    generated_dir = joinpath(run_dir, "tests", "generated"),
    student_dir = joinpath(run_dir, "student"),
    data_dir = joinpath(run_dir, "data"),
    student_file = get(ENV, "JULIA_STUDENT_FILE", "student.jl"),
    answer_file = get(ENV, "JULIA_REFERENCE_FILE", "answer.jl"),
    setup_file = get(ENV, "JULIA_SETUP_FILE", "setup.jl"),
    manifest_file = get(ENV, "JULIA_MANIFEST_FILE", "manifest.toml"),
  )
end

function load_data(data_file::AbstractString)
  if !isfile(data_file)
    return Dict{String, Any}()
  end
  return normalize_json_value(JSON3.read(read(data_file, String)))
end

function find_submission_file(dir::AbstractString, preferred::AbstractString)
  preferred_path = joinpath(dir, preferred)
  if isfile(preferred_path)
    return preferred_path
  end
  fallback = sort(filter(path -> endswith(path, ".jl"), readdir(dir; join = true)))
  if length(fallback) == 1
    return first(fallback)
  end
  error("Could not find a submission file in $(dir). Expected $(preferred) or exactly one .jl file.")
end

function load_optional_source(path::AbstractString)
  if isfile(path)
    return read(path, String)
  end
  return nothing
end

function source_file_candidates(tests_dir::AbstractString)
  candidates = String[]
  reserved = Set(["answer.jl", "setup.jl", "student.jl"])
  if isdir(joinpath(tests_dir, "exported"))
    append!(
      candidates,
      sort(filter(path -> endswith(path, ".jl"), readdir(joinpath(tests_dir, "exported"); join = true))),
    )
  end
  if isdir(joinpath(tests_dir, "macro"))
    append!(
      candidates,
      sort(filter(path -> endswith(path, ".jl"), readdir(joinpath(tests_dir, "macro"); join = true))),
    )
  end
  if isempty(candidates)
    for entry in sort(readdir(tests_dir; join = true))
      if isfile(entry) && endswith(entry, ".jl") && !(basename(entry) in reserved)
        push!(candidates, entry)
      end
    end
  end
  return candidates
end

function load_manifest(tests_dir::AbstractString, manifest_file::AbstractString)
  manifest_path = joinpath(tests_dir, manifest_file)
  if !isfile(manifest_path)
    return nothing
  end
  return TOML.parsefile(manifest_path)
end

function manifest_sources(tests_dir::AbstractString, manifest::Union{Nothing,Dict{String, Any}})
  if manifest === nothing
    return String[]
  end
  if haskey(manifest, "sources")
    return [joinpath(tests_dir, String(source)) for source in manifest["sources"]]
  end
  return String[]
end

function build_setup_module(data, setup_source::Union{Nothing, String})
  setup_module = SetupModule
  Core.eval(setup_module, :(using Main.PrairieLearnJuliaAutograder))
  Core.eval(setup_module, :(const data = $(json_value_expr(data))))
  if setup_source !== nothing
    Base.include_string(setup_module, setup_source, "setup.jl")
  end
  return setup_module
end

function maybe_call_repeated_setup()
  state = current_state()
  setup_module = state.setup_module
  if isdefined(setup_module, :repeated_setup)
    repeated_setup = getproperty(setup_module, :repeated_setup)
    if repeated_setup isa Function
      repeated_setup()
    end
  end
end

function load_code_module(file_path::AbstractString, module_name::Symbol, setup_module::Module)
  if !isfile(file_path)
    error("Missing required file: $(file_path)")
  end
  mod = Module(module_name)
  Core.eval(mod, :(using Main.PrairieLearnJuliaAutograder))
  Core.eval(mod, :(using Main.PrairieLearnJuliaAutograder.SetupModule))
  Core.eval(mod, :(const data = Main.PrairieLearnJuliaAutograder.current_state().data))
  Base.include(mod, file_path)
  return mod
end

function register_source_file(source_path::AbstractString, source_text::AbstractString)
  reset_registration!()
  REGISTERING[] = true
  CURRENT_SOURCE_FILE[] = String(source_path)
  registration_module = Module(Symbol("JuliaRegistration_" * replace(basename(source_path), "." => "_")))
  Core.eval(registration_module, :(using Main.PrairieLearnJuliaAutograder))
  Core.eval(registration_module, :(using Main.PrairieLearnJuliaAutograder.SetupModule))
  Core.eval(registration_module, :(const data = Main.PrairieLearnJuliaAutograder.current_state().data))
  Core.eval(registration_module, :(const student = Main.PrairieLearnJuliaAutograder.current_state().student))
  Core.eval(registration_module, :(const reference = Main.PrairieLearnJuliaAutograder.current_state().reference))
  try
    Base.include_string(registration_module, source_text, source_path)
  finally
    REGISTERING[] = false
  end
  return [spec for spec in REGISTERED_SPECS[]]
end

function write_generated_manifest(generated_dir::AbstractString, manifest::Dict{String, Any})
  mkpath(generated_dir)
  open(joinpath(generated_dir, "manifest.json"), "w") do io
    JSON3.write(io, manifest)
  end
end

function result_name(spec::TestSpec, iteration::Int)
  base_name = current_name_path()
  base_name = isempty(base_name) ? spec.name : base_name
  if spec.repeats > 1
    return "$base_name ($iteration/$(spec.repeats))"
  end
  return base_name
end

function finalize_test_result(spec::TestSpec, iteration::Int, ctx::TestContext, output::String)
  score = if ctx.score_override !== nothing
    ctx.score_override
  elseif ctx.assertions > 0 && !ctx.failed
    1.0
  else
    0.0
  end
  if ctx.failed && ctx.score_override === nothing && ctx.assertions > 0
    score = 0.0
  end
  message = isempty(ctx.messages) ? "" : join(ctx.messages, "\n")
  return Dict{String, Any}(
    "name" => result_name(spec, iteration),
    "description" => spec.description,
    "points" => score * spec.points,
    "max_points" => spec.points,
    "message" => message,
    "output" => output,
    "filename" => spec.source_file,
  )
end

function run_test_body(spec::TestSpec, body::Function)
  state = current_state()
  results = Dict{String, Any}[]
  for iteration in 1:spec.repeats
    maybe_call_repeated_setup()
    seed = stable_seed(spec.source_file, spec.name, string(iteration), get(ENV, "JULIA_GRADER_SEED", "1"))
    Random.seed!(seed)
    ctx = TestContext(spec = spec, iteration = iteration)
    CURRENT_CONTEXT[] = ctx
    buffer = IOBuffer()
    try
      redirect_stdout(buffer) do
        redirect_stderr(buffer) do
          body()
        end
      end
    catch err
      ctx.failed = true
      push!(ctx.messages, sprint(showerror, err, catch_backtrace()))
    finally
      CURRENT_CONTEXT[] = nothing
    end
    ctx.output = String(take!(buffer))
    push!(results, finalize_test_result(spec, iteration, ctx, ctx.output))
  end
  append!(state.results, results)
  return nothing
end

function pl_testcase(body::Function, name::AbstractString; points::Real = 1, repeats::Int = 1, description::AbstractString = "")
  spec = TestSpec(
    name = String(name),
    description = String(description),
    points = Float64(points),
    repeats = repeats,
    mode = :exported,
    source_file = CURRENT_SOURCE_FILE[],
  )
  if REGISTERING[]
    register_spec!(spec)
    return nothing
  end
  push_name!(name)
  try
    return run_test_body(spec, body)
  finally
    pop_name!()
  end
end

function pl_testset(body::Function, name::AbstractString; points::Real = 1, repeats::Int = 1, description::AbstractString = "")
  spec = TestSpec(
    name = String(name),
    description = String(description),
    points = Float64(points),
    repeats = repeats,
    mode = :macro,
    source_file = CURRENT_SOURCE_FILE[],
  )
  if REGISTERING[]
    register_spec!(spec)
    return nothing
  end
  push_name!(name)
  try
    return run_test_body(spec, body)
  finally
    pop_name!()
  end
end

function discover_source_files(tests_dir::AbstractString, manifest_sources::Vector{String})
  if !isempty(manifest_sources)
    return manifest_sources
  end
  return source_file_candidates(tests_dir)
end

function generate_wrapper_text(source_path::AbstractString, source_text::AbstractString, spec_count::Int)
  header = """
# Generated by PrairieLearnJuliaAutograder.
# Source: $(source_path)
# Registered tests: $(spec_count)
"""
  return header * source_text * "\n"
end

function delete_file_if_exists(path::AbstractString)
  if isfile(path)
    rm(path; force = true)
  end
end

function write_generated_wrapper(generated_dir::AbstractString, index::Int, source_path::AbstractString, wrapper_text::AbstractString)
  mkpath(generated_dir)
  file_name = lpad(string(index), 3, "0") * "_" * replace(basename(source_path), r"[^A-Za-z0-9_.-]" => "_")
  wrapper_path = joinpath(generated_dir, file_name)
  open(wrapper_path, "w") do io
    write(io, wrapper_text)
  end
  return wrapper_path
end

function build_source_manifest_entry(source_path::AbstractString, wrapper_path::AbstractString, specs::Vector{TestSpec})
  return Dict{String, Any}(
    "source" => source_path,
    "generated" => wrapper_path,
    "tests" => [Dict(
      "name" => spec.name,
      "description" => spec.description,
      "points" => spec.points,
      "repeats" => spec.repeats,
      "mode" => String(spec.mode),
    ) for spec in specs],
  )
end

function emit_failure(results_file::AbstractString, message::AbstractString)
  open(results_file, "w") do io
    JSON3.write(
      io,
      Dict(
        "succeeded" => false,
        "gradable" => false,
        "score" => 0.0,
        "message" => message,
      ),
    )
  end
end

function run_generated_wrapper(wrapper_text::AbstractString, module_name::Symbol, setup_module::Module, data_expr, student_module::Module, reference_module::Module)
  mod = Module(module_name)
  Core.eval(mod, :(using Main.PrairieLearnJuliaAutograder))
  Core.eval(mod, :(using Main.PrairieLearnJuliaAutograder.SetupModule))
  Core.eval(mod, :(const data = $data_expr))
  Core.eval(mod, :(student = Main.PrairieLearnJuliaAutograder.current_state().student))
  Core.eval(mod, :(reference = Main.PrairieLearnJuliaAutograder.current_state().reference))
  Base.include_string(mod, wrapper_text, String(module_name))
  return nothing
end

function run_autograder()
  try
    config = config_from_environment("/grade/run")
    data = load_data(joinpath(config.data_dir, "data.json"))
    manifest = load_manifest(config.tests_dir, config.manifest_file)
    if manifest !== nothing
      config.student_file = get(manifest, "student_file", config.student_file)
      config.answer_file = get(manifest, "answer_file", config.answer_file)
      config.setup_file = get(manifest, "setup_file", config.setup_file)
    end
    setup_source = load_optional_source(joinpath(config.tests_dir, config.setup_file))
    setup_module = build_setup_module(data, setup_source)
    delete_file_if_exists(joinpath(config.data_dir, "data.json"))

    state = RunState(
      config = config,
      data = data,
      setup_module = setup_module,
      student = Module(:StudentPlaceholder),
      reference = Module(:ReferencePlaceholder),
    )
    CURRENT_STATE[] = state

    manifest_source_paths = manifest_sources(config.tests_dir, manifest)
    source_files = discover_source_files(config.tests_dir, manifest_source_paths)
    state.source_files = copy(source_files)

    if isempty(source_files)
      emit_failure(config.results_file, "No Julia test files were found.")
      return nothing
    end

    student_file = find_submission_file(config.student_dir, config.student_file)
    reference_file = joinpath(config.tests_dir, config.answer_file)
    state.student = load_code_module(student_file, :StudentSubmission, setup_module)
    if isfile(reference_file)
      state.reference = load_code_module(reference_file, :ReferenceSolution, setup_module)
      delete_file_if_exists(reference_file)
    end

    generated_manifest = Dict{String, Any}(
      "student_file" => student_file,
      "answer_file" => isfile(reference_file) ? reference_file : "",
      "setup_file" => setup_source === nothing ? "" : joinpath(config.tests_dir, config.setup_file),
      "sources" => Any[],
    )

    for (index, source_path) in enumerate(source_files)
      source_text = read(source_path, String)
      specs = register_source_file(source_path, source_text)
      wrapper_text = generate_wrapper_text(source_path, source_text, length(specs))
      wrapper_path = write_generated_wrapper(config.generated_dir, index, source_path, wrapper_text)
      push!(state.wrapper_texts, (wrapper_path, wrapper_text))
      state.source_spec_map[source_path] = specs
      push!(generated_manifest["sources"], build_source_manifest_entry(source_path, wrapper_path, specs))
    end

    write_generated_manifest(config.generated_dir, generated_manifest)
    delete_file_if_exists(joinpath(config.tests_dir, config.setup_file))
    delete_file_if_exists(joinpath(config.tests_dir, config.manifest_file))
    rm(config.tests_dir; recursive = true, force = true)

    for (index, (wrapper_path, wrapper_text)) in enumerate(state.wrapper_texts)
      specs = state.source_spec_map[source_files[index]]
      module_name = Symbol("JuliaGenerated_" * lpad(string(index), 3, "0"))
      run_generated_wrapper(wrapper_text, module_name, setup_module, json_value_expr(data), state.student, state.reference)
    end

    total_points = sum(test["max_points"] for test in state.results)
    earned_points = sum(test["points"] for test in state.results)
    score = iszero(total_points) ? 0.0 : earned_points / total_points

    open(config.results_file, "w") do io
      JSON3.write(
        io,
        Dict(
          "succeeded" => true,
          "gradable" => true,
          "score" => score,
          "max_points" => total_points,
          "tests" => state.results,
        ),
      )
    end
  catch err
    state = CURRENT_STATE[]
    message = sprint(showerror, err, catch_backtrace())
    if state !== nothing
      try
        emit_failure(state.config.results_file, message)
      catch
        rethrow(err)
      end
    else
      error(message)
    end
  end
  return nothing
end
