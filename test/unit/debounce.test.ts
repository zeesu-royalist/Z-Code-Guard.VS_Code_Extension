import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce } from '../../src/utils/debounce';

describe('Debounce Utility (debounce)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('debounces rapid calls into a single invocation after the delay window', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);

    // Call 5 times rapidly
    debounced('call 1');
    debounced('call 2');
    debounced('call 3');
    debounced('call 4');
    debounced('call 5');

    // Callback must NOT have executed yet
    expect(callback).not.toHaveBeenCalled();
    expect(debounced.isPending()).toBe(true);

    // Advance 499ms (just before deadline)
    vi.advanceTimersByTime(499);
    expect(callback).not.toHaveBeenCalled();

    // Advance 1ms (reaching 500ms)
    vi.advanceTimersByTime(1);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('call 5');
    expect(debounced.isPending()).toBe(false);
  });

  it('cancels scheduled invocation when cancel() is called', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);

    debounced('test');
    expect(debounced.isPending()).toBe(true);

    debounced.cancel();
    expect(debounced.isPending()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(callback).not.toHaveBeenCalled();
  });

  it('flushes pending invocation immediately when flush() is called', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);

    debounced('immediate test');
    expect(debounced.isPending()).toBe(true);

    debounced.flush();
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith('immediate test');
    expect(debounced.isPending()).toBe(false);

    // Further timer progress should not trigger a second call
    vi.advanceTimersByTime(600);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('cleans up via dispose() matching the VS Code Disposable contract', () => {
    const callback = vi.fn();
    const debounced = debounce(callback, 500);

    debounced('dispose test');
    expect(debounced.isPending()).toBe(true);

    debounced.dispose();
    expect(debounced.isPending()).toBe(false);

    vi.advanceTimersByTime(600);
    expect(callback).not.toHaveBeenCalled();
  });
});
