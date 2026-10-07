import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from '../src/hooks/useDebouncedValue';

afterEach(() => {
  vi.useRealTimers();
});

describe('useDebouncedValue', () => {
  it('returns the new value only after the delay has elapsed', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'shirt' } },
    );

    rerender({ value: 'jacket' });
    expect(result.current).toBe('shirt');

    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('shirt');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('jacket');
  });

  it('cancels a stale value when another value arrives during the delay', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, 300),
      { initialProps: { value: 'shirt' } },
    );

    rerender({ value: 'jacket' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'coat' });

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('shirt');

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('coat');
  });
});
