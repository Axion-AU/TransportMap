import { describe, expect, it } from 'vitest';
import { correctionUpdate, posteriorUpdate, samplePosterior } from '../src/bandit';

describe('gaussian thompson sampling', () => {
  it('conjugate update pulls the mean toward the observation and shrinks variance', () => {
    const prior = { mean: 0, variance: 1 };
    const post = posteriorUpdate(prior, 2);
    expect(post.variance).toBeCloseTo(0.5);
    expect(post.mean).toBeCloseTo(1); // 0.5 * (0/1 + 2)
    const post2 = posteriorUpdate(post, 2);
    expect(post2.variance).toBeCloseTo(1 / 3);
    expect(post2.mean).toBeGreaterThan(post.mean);
    expect(post2.mean).toBeLessThan(2);
  });

  it('repeated observations converge on the true mean', () => {
    let p = { mean: 0, variance: 1 };
    for (let i = 0; i < 200; i++) p = posteriorUpdate(p, 1.5);
    expect(p.mean).toBeCloseTo(1.5, 1);
    expect(p.variance).toBeLessThan(0.01);
  });

  it('72h correction shifts the mean by posterior variance times delta', () => {
    const p = { mean: 1, variance: 0.25 };
    const corrected = correctionUpdate(p, 0.8);
    expect(corrected.mean).toBeCloseTo(1 + 0.25 * 0.8);
    expect(corrected.variance).toBe(0.25);
  });

  it('sampling respects the posterior parameters', () => {
    // deterministic uniform source
    let seed = 42;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed / 2 ** 31;
    };
    const draws: number[] = [];
    for (let i = 0; i < 5000; i++) draws.push(samplePosterior({ mean: 3, variance: 4 }, rand));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    const varr = draws.reduce((a, b) => a + (b - mean) ** 2, 0) / draws.length;
    expect(mean).toBeCloseTo(3, 0);
    expect(Math.sqrt(varr)).toBeCloseTo(2, 0);
  });
});
