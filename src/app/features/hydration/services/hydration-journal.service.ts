import { computed, inject, Injectable, signal } from '@angular/core';
import { StorageService } from '../../../core/storage/storage.service';

interface Drink {
  amount: number;
  at: string;
}
interface Journal {
  goal: number;
  days: Record<string, Drink[]>;
}

export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

@Injectable({ providedIn: 'root' })
export class HydrationJournalService {
  private readonly storage = inject(StorageService);
  private readonly saved = this.storage.get<Journal>('hydration-journal');
  private readonly days = signal<Record<string, Drink[]>>(this.restoreDays(this.saved?.days));
  readonly today = signal(localDateKey());
  readonly goal = signal(this.validAmount(this.saved?.goal) ? this.saved!.goal : 2000);
  readonly drinks = computed(() => this.days()[this.today()] ?? []);
  readonly total = computed(() => this.drinks().reduce((sum, drink) => sum + drink.amount, 0));
  readonly progress = computed(() => Math.min(100, Math.round((this.total() / this.goal()) * 100)));
  readonly remaining = computed(() => Math.max(0, this.goal() - this.total()));
  readonly week = computed(() => {
    const monday = new Date(`${this.today()}T12:00:00`);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    return ['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((label, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const key = localDateKey(date);
      const total = (this.days()[key] ?? []).reduce((sum, drink) => sum + drink.amount, 0);
      return {
        label,
        key,
        total,
        today: key === this.today(),
        future: key > this.today(),
        progress: Math.min(100, (total / this.goal()) * 100),
      };
    });
  });

  addDrink(amount: number): void {
    if (!this.validAmount(amount)) return;
    const key = localDateKey();
    this.today.set(key);
    this.days.update((days) => ({
      ...days,
      [key]: [...(days[key] ?? []), { amount, at: new Date().toISOString() }],
    }));
    this.persist();
  }

  undoDrink(): void {
    const key = localDateKey();
    this.today.set(key);
    this.days.update((days) => ({ ...days, [key]: (days[key] ?? []).slice(0, -1) }));
    this.persist();
  }

  setGoal(amount: number): void {
    if (!Number.isInteger(amount) || amount < 500 || amount > 5000) return;
    this.goal.set(amount);
    this.persist();
  }

  private validAmount(amount: unknown): amount is number {
    return typeof amount === 'number' && Number.isInteger(amount) && amount > 0 && amount <= 5000;
  }

  private restoreDays(value: unknown): Record<string, Drink[]> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, drinks]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Array.isArray(drinks))
        .map(([key, drinks]) => [
          key,
          (drinks as Drink[]).filter(
            (drink) =>
              drink &&
              this.validAmount(drink.amount) &&
              typeof drink.at === 'string' &&
              !Number.isNaN(Date.parse(drink.at)),
          ),
        ]),
    );
  }

  private persist(): void {
    this.storage.set<Journal>('hydration-journal', { goal: this.goal(), days: this.days() });
  }
}
