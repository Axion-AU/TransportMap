import { describe, expect, it } from 'vitest';
import { graphemeLength, levenshtein, spearman, stripHtml, zScore } from '../src/util';

describe('levenshtein', () => {
  it('computes classic distances', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('graphemeLength', () => {
  it('counts graphemes, not UTF-16 units (bluesky limit semantics)', () => {
    expect(graphemeLength('hello')).toBe(5);
    expect(graphemeLength('👍🏽')).toBe(1); // emoji + skin tone modifier
    expect('👍🏽'.length).toBeGreaterThan(1);
  });
});

describe('zScore', () => {
  it('standardises against the sample', () => {
    expect(zScore(3, [1, 2, 3, 4, 5])).toBeCloseTo((3 - 3) / Math.sqrt(2));
    expect(zScore(5, [1, 2, 3, 4, 5])).toBeGreaterThan(0);
  });
  it('returns 0 when the sample has no variance or is too small', () => {
    expect(zScore(4, [2, 2, 2])).toBe(0);
    expect(zScore(4, [])).toBe(0);
    expect(zScore(4, [1])).toBe(0);
  });
});

describe('spearman', () => {
  it('is 1 for a monotone relationship', () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
  });
  it('is -1 for a reversed relationship', () => {
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
  });
  it('is null with fewer than 3 points', () => {
    expect(spearman([1, 2], [2, 1])).toBeNull();
  });
});

describe('stripHtml', () => {
  it('flattens mastodon status html', () => {
    expect(stripHtml('<p>hello <a href="x">world</a></p>')).toBe('hello world');
    expect(stripHtml('a&amp;b &lt;3')).toBe('a&b <3');
  });
});
