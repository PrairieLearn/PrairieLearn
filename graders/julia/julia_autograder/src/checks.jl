function record_assertion!(ctx::TestContext)
  ctx.assertions += 1
  return nothing
end

function record_failure!(ctx::TestContext, message::AbstractString)
  ctx.failed = true
  push!(ctx.messages, String(message))
  return false
end

function feedback!(message::AbstractString)
  ctx = current_context()
  push!(ctx.messages, String(message))
  return nothing
end

function set_score!(score::Real)
  ctx = current_context()
  ctx.score_override = clamp(Float64(score), 0.0, 1.0)
  return nothing
end

function call_user(f, args...; kwargs...)
  return f(args...; kwargs...)
end

function comparable(expected, actual; rtol::Real = 1e-5, atol::Real = 1e-8)
  if expected isa Number && actual isa Number
    return isapprox(expected, actual; rtol = rtol, atol = atol)
  elseif expected isa AbstractArray && actual isa AbstractArray
    return size(expected) == size(actual) && all(zip(expected, actual)) do pair
      comparable(first(pair), last(pair); rtol = rtol, atol = atol)
    end
  else
    return isequal(expected, actual)
  end
end

function check_scalar(name::AbstractString, expected, actual; rtol::Real = 1e-5, atol::Real = 1e-8)
  ctx = current_context()
  record_assertion!(ctx)
  if comparable(expected, actual; rtol = rtol, atol = atol)
    return true
  end
  return record_failure!(
    ctx,
    "$name: expected $(repr(expected)), got $(repr(actual))",
  )
end

function check_list(name::AbstractString, expected, actual)
  ctx = current_context()
  record_assertion!(ctx)
  if !(actual isa AbstractVector)
    return record_failure!(ctx, "$name: expected an array-like value, got $(typeof(actual))")
  end
  if length(expected) != length(actual)
    return record_failure!(ctx, "$name: expected length $(length(expected)), got $(length(actual))")
  end
  for (index, pair) in enumerate(zip(expected, actual))
    if !comparable(first(pair), last(pair))
      return record_failure!(ctx, "$name[$index] did not match: expected $(repr(first(pair))), got $(repr(last(pair)))")
    end
  end
  return true
end

function check_dict(name::AbstractString, expected, actual)
  ctx = current_context()
  record_assertion!(ctx)
  if !(actual isa AbstractDict)
    return record_failure!(ctx, "$name: expected a dictionary-like value, got $(typeof(actual))")
  end
  for (key, expected_value) in pairs(expected)
    if !haskey(actual, key)
      return record_failure!(ctx, "$name: missing key $(repr(key))")
    end
    actual_value = actual[key]
    if !comparable(expected_value, actual_value)
      return record_failure!(
        ctx,
        "$name[$(repr(key))] did not match: expected $(repr(expected_value)), got $(repr(actual_value))",
      )
    end
  end
  for key in keys(actual)
    if !haskey(expected, key)
      return record_failure!(ctx, "$name: unexpected key $(repr(key))")
    end
  end
  return true
end

function check_call(name::AbstractString, expected, f, args...; kwargs...)
  actual = call_user(f, args...; kwargs...)
  return check_scalar(name, expected, actual)
end

macro test(expr)
  file = String(__source__.file)
  line = __source__.line
  return quote
    local _ctx = PrairieLearnJuliaAutograder.current_context()
    local _passed = false
    try
      local _value = $(esc(expr))
      _passed = _value === true
      PrairieLearnJuliaAutograder.record_assertion!(_ctx)
      if !_passed
        PrairieLearnJuliaAutograder.record_failure!(
          _ctx,
          "Test failed at $(file):$(line): expected `true`, got $(repr(_value))",
        )
      end
    catch err
      PrairieLearnJuliaAutograder.record_assertion!(_ctx)
      PrairieLearnJuliaAutograder.record_failure!(
        _ctx,
        "Test errored at $(file):$(line): " * sprint(showerror, err),
      )
    end
    _passed
  end
end

macro test_throws(expected_exception, expr)
  file = String(__source__.file)
  line = __source__.line
  return quote
    local _ctx = PrairieLearnJuliaAutograder.current_context()
    local _expected = $(esc(expected_exception))
    local _threw = false
    try
      $(esc(expr))
      PrairieLearnJuliaAutograder.record_assertion!(_ctx)
      PrairieLearnJuliaAutograder.record_failure!(
        _ctx,
        "Test failed at $(file):$(line): expected $(repr(_expected)) to be thrown, but no exception was raised.",
      )
    catch err
      PrairieLearnJuliaAutograder.record_assertion!(_ctx)
      if err isa _expected
        _threw = true
      else
        PrairieLearnJuliaAutograder.record_failure!(
          _ctx,
          "Test failed at $(file):$(line): expected $(repr(_expected)), but got " * sprint(showerror, err),
        )
      end
    end
    _threw
  end
end
