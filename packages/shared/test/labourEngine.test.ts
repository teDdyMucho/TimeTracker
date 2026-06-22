import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyDay,
  bandsForDay,
  computeDay,
  computePeriod,
  payrollBreakdown,
  round2,
} from '../src/labourEngine.js';
import { DEFAULT_PAY_CONFIG } from '../src/constants.js';

const cfg = DEFAULT_PAY_CONFIG;
const RATE = 40;

// Reference calendar dates (verified): 2026-06-22 Mon, 06-20 Sat, 06-21 Sun.
const MON = '2026-06-22';
const SAT = '2026-06-20';
const SUN = '2026-06-21';

const entry = (projectId: string, hours: number, opts: Partial<{ entity: string; loc: 'site' | 'workshop' }> = {}) => ({
  projectId,
  businessEntityId: opts.entity ?? 'build_one',
  workLocation: (opts.loc ?? 'site') as 'site' | 'workshop',
  hours,
});

test('classifyDay: weekend and public holiday detection', () => {
  assert.equal(classifyDay(MON, false), 'weekday');
  assert.equal(classifyDay(SAT, false), 'saturday');
  assert.equal(classifyDay(SUN, false), 'sunday');
  assert.equal(classifyDay(MON, true), 'public_holiday'); // PH overrides weekday
});

test('bandsForDay: weekday tier ladder (8 / 8-10 / 10+)', () => {
  assert.deepEqual(bandsForDay(8, 'weekday', cfg), [
    { band: 'regular', multiplier: 1.0, hours: 8 },
  ]);
  assert.deepEqual(bandsForDay(9, 'weekday', cfg), [
    { band: 'regular', multiplier: 1.0, hours: 8 },
    { band: 'overtime_t1', multiplier: 1.5, hours: 1 },
  ]);
  assert.deepEqual(bandsForDay(11, 'weekday', cfg), [
    { band: 'regular', multiplier: 1.0, hours: 8 },
    { band: 'overtime_t1', multiplier: 1.5, hours: 2 },
    { band: 'overtime_t2', multiplier: 2.0, hours: 1 },
  ]);
});

test('computeDay: 8h ordinary weekday', () => {
  const r = computeDay(MON, [entry('p1', 8)], RATE, cfg);
  assert.equal(r.dayType, 'weekday');
  assert.equal(r.totalHours, 8);
  assert.equal(r.gross, 320); // 8 * 40
  assert.equal(r.allocations[0]!.cost, 320);
});

test('computeDay: 11h weekday spills through both OT tiers', () => {
  const r = computeDay(MON, [entry('p1', 11)], RATE, cfg);
  // 8*40 + 2*40*1.5 + 1*40*2 = 320 + 120 + 80
  assert.equal(r.gross, 520);
  assert.deepEqual(
    r.bands.map((b) => [b.band, b.hours, b.cost]),
    [
      ['regular', 8, 320],
      ['overtime_t1', 2, 120],
      ['overtime_t2', 1, 80],
    ],
  );
});

test('computeDay: Saturday / Sunday / public holiday whole-day rates', () => {
  assert.equal(computeDay(SAT, [entry('p1', 6)], RATE, cfg).gross, 360); // 6*40*1.5
  assert.equal(computeDay(SUN, [entry('p1', 5)], RATE, cfg).gross, 400); // 5*40*2.0
  assert.equal(computeDay(MON, [entry('p1', 4)], RATE, cfg, true).gross, 400); // 4*40*2.5
});

test('computeDay: multi-project OT premium shared proportionally', () => {
  const r = computeDay(
    MON,
    [entry('A', 4), entry('B', 4), entry('C', 2)],
    RATE,
    cfg,
  );
  // total 10h → 8 reg (320) + 2 OT1 (120) = 440 gross
  assert.equal(r.gross, 440);
  const byProject = Object.fromEntries(r.allocations.map((a) => [a.projectId, a.cost]));
  assert.equal(byProject.A, 176); // 4/10 * 440
  assert.equal(byProject.B, 176);
  assert.equal(byProject.C, 88); // 2/10 * 440
  assert.equal(round2(r.allocations.reduce((s, a) => s + a.cost, 0)), 440);
});

test('computeDay: hours spanning two entities split, totals reconcile', () => {
  const r = computeDay(
    MON,
    [entry('A', 6, { entity: 'build_one', loc: 'site' }), entry('B', 4, { entity: 'arko', loc: 'workshop' })],
    RATE,
    cfg,
  );
  assert.equal(r.gross, 440);
  const byEntity = Object.fromEntries(r.allocations.map((a) => [a.businessEntityId, a.cost]));
  assert.equal(byEntity.build_one, 264); // 6/10 * 440
  assert.equal(byEntity.arko, 176); // 4/10 * 440
});

test('computeDay: rounding drift is absorbed so parts sum to gross', () => {
  // gross = 3h * (100/3) = 100.00 exactly, split 3 ways → 33.33 each = 99.99
  const rate = 100 / 3;
  const r = computeDay(MON, [entry('A', 1), entry('B', 1), entry('C', 1)], rate, cfg);
  assert.equal(r.gross, 100);
  const total = round2(r.allocations.reduce((s, a) => s + a.cost, 0));
  assert.equal(total, 100); // drift fix keeps it exact
});

test('computePeriod: aggregates band / project / entity / location', () => {
  const period = computePeriod(
    [
      { date: MON, entries: [entry('P1', 8, { loc: 'site' })] },
      { date: SAT, entries: [entry('P1', 4, { loc: 'workshop' })] },
    ],
    RATE,
    cfg,
  );
  assert.equal(period.totalHours, 12);
  assert.equal(period.gross, 560); // 320 + 4*40*1.5(240)
  assert.equal(period.byBand.regular.hours, 8);
  assert.equal(period.byBand.regular.cost, 320);
  assert.equal(period.byBand.saturday.hours, 4);
  assert.equal(period.byBand.saturday.cost, 240);
  assert.equal(period.byProject.P1!.hours, 12);
  assert.equal(period.byProject.P1!.cost, 560);
  assert.equal(period.byLocation.site.cost, 320);
  assert.equal(period.byLocation.workshop.cost, 240);
});

test('payrollBreakdown: reduces a period to Xero earnings lines', () => {
  const period = computePeriod(
    [
      { date: MON, entries: [entry('P1', 10)] }, // 8 reg + 2 ot1
      { date: SUN, entries: [entry('P1', 3)] }, // 3 sunday
    ],
    RATE,
    cfg,
  );
  const pb = payrollBreakdown(period);
  assert.equal(pb.bandHours.regular, 8);
  assert.equal(pb.bandHours.overtime_t1, 2);
  assert.equal(pb.bandHours.sunday, 3);
  assert.equal(pb.bandHours.overtime_t2, 0);
  // gross = 320 + 120 + 3*40*2 (240) = 680
  assert.equal(pb.grossPay, 680);
});
