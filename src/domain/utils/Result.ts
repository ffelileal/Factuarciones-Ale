export class Result<T, E = string> {
  public readonly isSuccess: boolean;
  public readonly error: E | null;
  private readonly _value: T | null;

  private constructor(isSuccess: boolean, error: E | null, value: T | null) {
    this.isSuccess = isSuccess;
    this.error = error;
    this._value = value;
  }

  public static ok<T, E = string>(value: T): Result<T, E> {
    return new Result<T, E>(true, null, value);
  }

  public static fail<T, E = string>(error: E): Result<T, E> {
    return new Result<T, E>(false, error, null);
  }

  public get value(): T {
    if (!this.isSuccess) {
      throw new Error(`Intentando acceder al valor de un resultado fallido: ${JSON.stringify(this.error)}`);
    }
    return this._value as T;
  }
}
