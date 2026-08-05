import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { brewCountTitle, useDocumentTitle } from './use-document-title';

describe('brewCountTitle', () => {
  it('uses the format the brief specifies', () => {
    expect(brewCountTitle(3)).toBe('Brews: 3');
  });

  it('handles an empty log', () => {
    expect(brewCountTitle(0)).toBe('Brews: 0');
  });
});

describe('useDocumentTitle', () => {
  it('sets the document title', () => {
    renderHook(() => {
      useDocumentTitle('Brews: 7');
    });

    expect(document.title).toBe('Brews: 7');
  });

  it('updates when the count changes rather than only on first render', () => {
    const { rerender } = renderHook(
      ({ title }: { title: string }) => {
        useDocumentTitle(title);
      },
      { initialProps: { title: 'Brews: 1' } },
    );

    expect(document.title).toBe('Brews: 1');

    rerender({ title: 'Brews: 2' });
    expect(document.title).toBe('Brews: 2');
  });
});
