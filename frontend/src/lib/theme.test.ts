import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, isTheme, nextTheme, readTheme } from './theme';

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
});

describe('reading the choice', () => {
  it('defaults to the system preference', () => {
    expect(readTheme()).toBe('system');
  });

  it('remembers an explicit choice', () => {
    applyTheme('light');

    expect(readTheme()).toBe('light');
  });

  it('ignores a stored value that is not a theme', () => {
    localStorage.setItem('crema:theme', 'sepia');

    expect(readTheme()).toBe('system');
  });

  it('falls back to the system preference when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    // Private browsing blocks storage entirely. A theme that cannot be
    // remembered is not a reason to fail to render.
    expect(readTheme()).toBe('system');
  });
});

describe('applying the choice', () => {
  it('stamps the attribute the CSS keys off', () => {
    applyTheme('dark');

    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  });

  it('removes the attribute for system, handing control back to the media query', () => {
    applyTheme('dark');
    applyTheme('system');

    expect(document.documentElement).not.toHaveAttribute('data-theme');
  });

  it('still applies the theme when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(() => applyTheme('light')).not.toThrow();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
  });
});

describe('cycling', () => {
  it('visits all three states and returns to the start', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });
});

describe('isTheme', () => {
  it('accepts the three themes and nothing else', () => {
    expect(isTheme('system')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    expect(isTheme(null)).toBe(false);
  });
});
