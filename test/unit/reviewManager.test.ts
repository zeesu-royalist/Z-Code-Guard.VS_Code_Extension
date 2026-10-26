import { describe, it, expect, beforeEach } from 'vitest';
import { reviewManager } from '../../src/analysis/reviewManager';

describe('Review Manager (reviewManager)', () => {
  beforeEach(() => {
    reviewManager.clear();
  });

  it('toggles and queries reviewed file state with path normalization', () => {
    expect(reviewManager.isReviewed('src/auth/session.ts')).toBe(false);
    expect(reviewManager.getReviewedCount()).toBe(0);

    const marked = reviewManager.toggleReviewed('src\\auth\\session.ts');
    expect(marked).toBe(true);
    expect(reviewManager.isReviewed('src/auth/session.ts')).toBe(true);
    expect(reviewManager.getReviewedCount()).toBe(1);

    const unmarked = reviewManager.toggleReviewed('src/auth/session.ts');
    expect(unmarked).toBe(false);
    expect(reviewManager.isReviewed('src/auth/session.ts')).toBe(false);
    expect(reviewManager.getReviewedCount()).toBe(0);
  });
});
