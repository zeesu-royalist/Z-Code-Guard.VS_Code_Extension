/**
 * Debounce utility for Z-Code-Guard.
 *
 * Prevents multiple rapid executions of a function by delaying its execution
 * until after a specified wait duration has elapsed since the last time it was invoked.
 *
 * Implements vscode.Disposable via the `dispose()` method to guarantee clean
 * lifecycle management and prevent memory leaks.
 */

export interface DebouncedFunction<T extends (...args: any[]) => any> {
  (...args: Parameters<T>): void;

  /**
   * Cancels any pending scheduled invocation without executing it.
   */
  cancel(): void;

  /**
   * Immediately executes any pending scheduled invocation.
   */
  flush(): void;

  /**
   * Returns true if an invocation is currently scheduled and pending.
   */
  isPending(): boolean;

  /**
   * Conforms to the VS Code Disposable interface. Cancels any pending timer.
   */
  dispose(): void;
}

/**
 * Creates a debounced version of the provided function.
 *
 * @param fn - The function to debounce.
 * @param delayMs - Duration in milliseconds to wait before executing after the last call.
 * @returns A DebouncedFunction with cancel, flush, isPending, and dispose methods.
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delayMs: number
): DebouncedFunction<T> {
  let timeoutId: NodeJS.Timeout | undefined = undefined;
  let lastArgs: Parameters<T> | undefined = undefined;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;

    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      timeoutId = undefined;
      const argsToCall = lastArgs;
      lastArgs = undefined;
      if (argsToCall) {
        fn(...argsToCall);
      }
    }, delayMs);
  };

  debounced.cancel = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
    }
    lastArgs = undefined;
  };

  debounced.flush = () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
      timeoutId = undefined;
      const argsToCall = lastArgs;
      lastArgs = undefined;
      if (argsToCall) {
        fn(...argsToCall);
      }
    }
  };

  debounced.isPending = () => timeoutId !== undefined;

  debounced.dispose = () => {
    debounced.cancel();
  };

  return debounced;
}
