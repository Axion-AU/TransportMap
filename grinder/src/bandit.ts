/**
 * Gaussian Thompson sampling (§3.5). Rewards are continuous z-scores, so arms
 * hold a Normal posterior over mean reward and are updated with the
 * normal-normal conjugate rule assuming unit observation variance.
 */

export interface Posterior {
  mean: number;
  variance: number;
}

/** Draw one sample from Normal(mean, variance) via Box-Muller. */
export function samplePosterior(p: Posterior, rand: () => number = Math.random): number {
  let u1 = 0;
  while (u1 === 0) u1 = rand();
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return p.mean + Math.sqrt(p.variance) * z;
}

/** Conjugate update with one observation (obs variance = 1). */
export function posteriorUpdate(p: Posterior, reward: number): Posterior {
  const variance = 1 / (1 / p.variance + 1);
  const mean = variance * (p.mean / p.variance + reward);
  return { mean, variance };
}

/**
 * 72h correction pass (§6): one already-incorporated observation moved by
 * `delta`, which shifts the posterior mean by posterior_variance * delta.
 */
export function correctionUpdate(p: Posterior, delta: number): Posterior {
  return { mean: p.mean + p.variance * delta, variance: p.variance };
}

export interface ArmRow extends Posterior {
  n_pulls: number;
}

export async function getArm(
  db: D1Database,
  table: 'bandit_arms' | 'cadence_arms',
  keys: Record<string, string>
): Promise<ArmRow> {
  const cols = Object.keys(keys);
  const where = cols.map((c) => `${c} = ?`).join(' AND ');
  const row = await db
    .prepare(`SELECT mean, variance, n_pulls FROM ${table} WHERE ${where}`)
    .bind(...cols.map((c) => keys[c]))
    .first<ArmRow>();
  return row ?? { mean: 0, variance: 1, n_pulls: 0 };
}

export async function updateArm(
  db: D1Database,
  table: 'bandit_arms' | 'cadence_arms',
  keys: Record<string, string>,
  reward: number
): Promise<void> {
  const current = await getArm(db, table, keys);
  const next = posteriorUpdate(current, reward);
  await writeArm(db, table, keys, next, current.n_pulls + 1);
}

export async function correctArm(
  db: D1Database,
  table: 'bandit_arms' | 'cadence_arms',
  keys: Record<string, string>,
  delta: number
): Promise<void> {
  const current = await getArm(db, table, keys);
  const next = correctionUpdate(current, delta);
  await writeArm(db, table, keys, next, current.n_pulls);
}

async function writeArm(
  db: D1Database,
  table: 'bandit_arms' | 'cadence_arms',
  keys: Record<string, string>,
  p: Posterior,
  nPulls: number
): Promise<void> {
  const cols = Object.keys(keys);
  await db
    .prepare(
      `INSERT INTO ${table} (${cols.join(', ')}, mean, variance, n_pulls, updated_at)
       VALUES (${cols.map(() => '?').join(', ')}, ?, ?, ?, ?)
       ON CONFLICT (${cols.join(', ')}) DO UPDATE SET
         mean = excluded.mean, variance = excluded.variance,
         n_pulls = excluded.n_pulls, updated_at = excluded.updated_at`
    )
    .bind(...cols.map((c) => keys[c]), p.mean, p.variance, nPulls, new Date().toISOString())
    .run();
}
