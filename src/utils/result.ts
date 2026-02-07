/**
 * Result type for handling expected failures without exceptions.
 * Use this for LLM parse errors, tool failures, and other recoverable errors.
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E }

/**
 * Create a successful Result
 */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

/**
 * Create a failed Result
 */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

/**
 * Check if a Result is successful
 */
export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

/**
 * Check if a Result is an error
 */
export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

/**
 * Unwrap a Result, throwing if it's an error
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) {
    return result.value
  }
  throw new Error(`Attempted to unwrap an error Result: ${JSON.stringify(result.error)}`)
}

/**
 * Unwrap a Result with a default value if it's an error
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
  if (result.ok) {
    return result.value
  }
  return defaultValue
}

/**
 * Map over a successful Result
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  if (result.ok) {
    return ok(fn(result.value))
  }
  return result
}

/**
 * Map over an error Result
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  if (!result.ok) {
    return err(fn(result.error))
  }
  return result
}

/**
 * Chain Result-returning functions
 */
export function flatMap<T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>
): Result<U, E> {
  if (result.ok) {
    return fn(result.value)
  }
  return result
}

/**
 * Combine multiple Results into a single Result containing an array
 */
export function all<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (!result.ok) {
      return result
    }
    values.push(result.value)
  }
  return ok(values)
}

/**
 * Try to execute a function and wrap the result
 */
export function tryCatch<T, E = Error>(fn: () => T, mapError?: (e: unknown) => E): Result<T, E> {
  try {
    return ok(fn())
  } catch (e) {
    if (mapError) {
      return err(mapError(e))
    }
    return err(e as E)
  }
}

/**
 * Async version of tryCatch
 */
export async function tryCatchAsync<T, E = Error>(
  fn: () => Promise<T>,
  mapError?: (e: unknown) => E
): Promise<Result<T, E>> {
  try {
    return ok(await fn())
  } catch (e) {
    if (mapError) {
      return err(mapError(e))
    }
    return err(e as E)
  }
}
