/**
 * Produces a type that only includes the nullable properties of T.
 */
type NullableProperties<T> = {
  [K in keyof T as null extends T[K] ? K : never]: T[K];
};

/**
 * Produces a type containing the keys of T that are nullable.
 */
type NullableKeys<T> = keyof NullableProperties<T>;

/**
 * Produces a type with the same keys as T. All properties are marked as required,
 * non-nullable, and not undefined.
 */
type RequiredProperty<T> = { [P in keyof T]-?: NonNullable<T[P]> };

/**
 * Produces a type with the same keys as T. If a key is in `RequiredKeys`, it will
 * be marked as non-optional and non-nullable. Otherwise, it will be marked as
 * optional with a type of `undefined`.
 *
 * ```ts
 * type Foo = { a: string; b?: number; c: null };
 * type Bar = WithRequiredKeys<Foo, 'a' | 'b'>;
 * // Bar is equivalent to { a: string; b: number; c?: undefined; }
 * ```
 */
export type WithRequiredKeys<T, RequiredKeys extends keyof T> = Omit<
  T,
  RequiredKeys | NullableKeys<T>
> &
  RequiredProperty<Pick<T, RequiredKeys>> & {
    [K in NullableKeys<Omit<T, RequiredKeys>>]?: undefined;
  };

/**
 * Useful for convincing an IDE to show the expansion of a type.
 *
 * ```ts
 * type Foo = { a: string; b?: number; c: null };
 * type Bar = ExpandRecursively<Foo>;
 * ```
 */
export type ExpandRecursively<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: ExpandRecursively<O[K]> }
    : never
  : T;

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${value}`);
}
