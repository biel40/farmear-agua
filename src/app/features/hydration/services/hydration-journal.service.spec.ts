import { TestBed } from '@angular/core/testing';
import { StorageService } from '../../../core/storage/storage.service';
import { HydrationJournalService, localDateKey } from './hydration-journal.service';

describe('HydrationJournalService', () => {
  const storage = { get: vi.fn(), set: vi.fn() };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 23, 12));
    storage.get.mockReset();
    storage.set.mockClear();
    TestBed.configureTestingModule({ providers: [{ provide: StorageService, useValue: storage }] });
  });

  afterEach(() => vi.useRealTimers());

  it('records, persists and undoes drinks without allowing a negative total', () => {
    const journal = TestBed.inject(HydrationJournalService);
    journal.addDrink(250);
    journal.addDrink(500);
    expect(journal.total()).toBe(750);
    expect(journal.drinks()).toHaveLength(2);
    expect(storage.set).toHaveBeenLastCalledWith(
      'hydration-journal',
      expect.objectContaining({
        goal: 2000,
        days: { '2026-10-23': expect.arrayContaining([expect.objectContaining({ amount: 250 })]) },
      }),
    );
    journal.undoDrink();
    expect(journal.total()).toBe(250);
    journal.undoDrink();
    journal.undoDrink();
    expect(journal.total()).toBe(0);
  });

  it('restores history and a personalized goal', () => {
    storage.get.mockReturnValue({
      goal: 1500,
      days: {
        '2026-10-22': [{ amount: 500, at: '2026-10-22T12:00:00Z' }],
        '2026-10-23': [{ amount: 250, at: '2026-10-23T09:00:00Z' }],
      },
    });
    const journal = TestBed.inject(HydrationJournalService);
    expect(journal.goal()).toBe(1500);
    expect(journal.total()).toBe(250);
    expect(journal.week().map((day) => day.total)).toEqual([0, 0, 0, 500, 250, 0, 0]);
    expect(journal.week()[4].today).toBe(true);
  });

  it('starts a new local day without erasing previous history', () => {
    const journal = TestBed.inject(HydrationJournalService);
    journal.addDrink(250);
    vi.setSystemTime(new Date(2026, 9, 24, 0, 1));
    journal.addDrink(100);
    expect(journal.total()).toBe(100);
    expect(journal.week()[4].total).toBe(250);
    expect(journal.week()[5].total).toBe(100);
    journal.undoDrink();
    expect(journal.total()).toBe(0);
    expect(journal.week()[4].total).toBe(250);
  });

  it('caps the visual goal at 100 percent and validates amounts and goals', () => {
    const journal = TestBed.inject(HydrationJournalService);
    journal.setGoal(500);
    journal.addDrink(1000);
    expect(journal.total()).toBe(1000);
    expect(journal.progress()).toBe(100);
    expect(journal.remaining()).toBe(0);
    for (const amount of [0, -10, 2.5, NaN, 6000]) journal.addDrink(amount);
    for (const goal of [0, -100, 300.5, 10000]) journal.setGoal(goal);
    expect(journal.total()).toBe(1000);
    expect(journal.goal()).toBe(500);
  });

  it('ignores malformed stored entries', () => {
    storage.get.mockReturnValue({
      goal: -5,
      days: {
        invalid: [],
        '2026-10-23': [
          null,
          { amount: '250', at: 'now' },
          { amount: 100, at: 'invalid' },
          { amount: 250, at: '2026-10-23T09:00:00Z' },
        ],
      },
    });
    const journal = TestBed.inject(HydrationJournalService);
    expect(journal.goal()).toBe(2000);
    expect(journal.total()).toBe(250);
    expect(journal.drinks()).toHaveLength(1);
  });

  it('uses the local calendar date', () => {
    expect(localDateKey(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02');
  });
});
