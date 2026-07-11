import { describe, expect, it } from 'vitest';
import { linkFacets } from '../src/adapters/bluesky';
import { rawReward } from '../src/reward';
import { composeText } from '../src/scheduler';
import { canTransition } from '../src/transitions';

describe('status transition map (§3.1)', () => {
  it('allows exactly the specified transitions', () => {
    expect(canTransition('generated', 'approved')).toBe(true);
    expect(canTransition('generated', 'dismissed')).toBe(true);
    expect(canTransition('approved', 'scheduled')).toBe(true);
    expect(canTransition('approved', 'expired')).toBe(true);
    expect(canTransition('approved', 'dismissed')).toBe(true);
    expect(canTransition('scheduled', 'posted')).toBe(true);
    expect(canTransition('scheduled', 'approved')).toBe(true); // unschedule
  });

  it('blocks every path that would skip approval (INV-1)', () => {
    expect(canTransition('generated', 'scheduled')).toBe(false);
    expect(canTransition('generated', 'posted')).toBe(false);
    expect(canTransition('dismissed', 'posted')).toBe(false);
    expect(canTransition('expired', 'scheduled')).toBe(false);
  });

  it('posted is terminal', () => {
    for (const to of ['generated', 'approved', 'scheduled', 'dismissed', 'expired'] as const) {
      expect(canTransition('posted', to)).toBe(false);
    }
  });
});

describe('reward function (§6)', () => {
  const weights = { reposts: 0.5, replies: 0.3, likes: 0.2 };

  it('weights engagement and normalises by followers at post time', () => {
    const r = rawReward({ likes: 10, reposts: 4, replies: 2, quotes: 0 }, 1000, weights);
    expect(r).toBeCloseTo((0.5 * 4 + 0.3 * 2 + 0.2 * 10) / 1000);
  });

  it('counts quotes as reposts (bluesky)', () => {
    const withQuotes = rawReward({ likes: 0, reposts: 2, replies: 0, quotes: 3 }, 100, weights);
    const merged = rawReward({ likes: 0, reposts: 5, replies: 0, quotes: 0 }, 100, weights);
    expect(withQuotes).toBeCloseTo(merged);
  });

  it('degrades safely with zero followers', () => {
    expect(rawReward({ likes: 5, reposts: 5, replies: 5, quotes: 0 }, 0, weights)).toBe(0);
  });
});

describe('posting composition', () => {
  it('appends the link when not already present', () => {
    expect(composeText({ text_final: 'take', link_url: 'https://x.au/a' })).toBe(
      'take\n\nhttps://x.au/a'
    );
    expect(composeText({ text_final: 'see https://x.au/a', link_url: 'https://x.au/a' })).toBe(
      'see https://x.au/a'
    );
    expect(composeText({ text_final: 'take', link_url: null })).toBe('take');
  });

  it('builds byte-accurate bluesky link facets', () => {
    const text = 'naïve → https://example.com/a done';
    const facets = linkFacets(text);
    expect(facets).toHaveLength(1);
    const enc = new TextEncoder();
    const bytes = enc.encode(text);
    const { byteStart, byteEnd } = facets[0].index;
    expect(new TextDecoder().decode(bytes.slice(byteStart, byteEnd))).toBe(
      'https://example.com/a'
    );
  });
});
