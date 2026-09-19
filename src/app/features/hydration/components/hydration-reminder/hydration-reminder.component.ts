import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HydrationReminderService } from '../../services/hydration-reminder.service';

type IntervalPreset = '15' | '30' | '45' | '60' | '120' | 'custom';
type IntervalUnit = 'minutes' | 'hours';

@Component({
  selector: 'app-hydration-reminder',
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './hydration-reminder.component.html',
  styleUrl: './hydration-reminder.component.scss',
})
export class HydrationReminderComponent {
  private readonly destroyRef = inject(DestroyRef);
  protected readonly reminder = inject(HydrationReminderService);
  protected readonly isBusy = signal(false);
  protected readonly feedback = signal<string | null>(null);

  protected readonly intervalOptions: ReadonlyArray<{ label: string; value: IntervalPreset }> = [
    { label: '15 minutos', value: '15' },
    { label: '30 minutos', value: '30' },
    { label: '45 minutos', value: '45' },
    { label: '1 hora', value: '60' },
    { label: '2 horas', value: '120' },
    { label: 'Personalizado', value: 'custom' },
  ];

  protected readonly intervalForm = new FormGroup({
    preset: new FormControl<IntervalPreset>(this.initialPreset(), { nonNullable: true }),
    customAmount: new FormControl(this.initialCustomAmount(), {
      nonNullable: true,
      validators: [Validators.required, Validators.min(1), Validators.max(1440)],
    }),
    customUnit: new FormControl<IntervalUnit>('minutes', { nonNullable: true }),
  });

  constructor() {
    this.intervalForm.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.applySelectedInterval());
  }

  protected async toggleReminders(): Promise<void> {
    if (this.isBusy()) {
      return;
    }

    this.isBusy.set(true);
    this.feedback.set(null);

    try {
      if (this.reminder.isActive()) {
        await this.reminder.pause();
      } else {
        const activated = await this.reminder.activate();
        if (!activated) {
          this.feedback.set('Necesitamos permiso para enviarte recordatorios.');
        }
      }
    } catch {
      this.feedback.set('No pudimos actualizar los recordatorios. Inténtalo de nuevo.');
    } finally {
      this.isBusy.set(false);
    }
  }

  private applySelectedInterval(): void {
    const { preset, customAmount, customUnit } = this.intervalForm.getRawValue();
    if (preset !== 'custom') {
      this.reminder.setInterval(Number(preset));
      return;
    }

    if (this.intervalForm.controls.customAmount.invalid) {
      return;
    }

    const multiplier = customUnit === 'hours' ? 60 : 1;
    this.reminder.setInterval(customAmount * multiplier);
  }

  private initialPreset(): IntervalPreset {
    const interval = String(this.reminder.intervalMinutes());
    return ['15', '30', '45', '60', '120'].includes(interval)
      ? (interval as IntervalPreset)
      : 'custom';
  }

  private initialCustomAmount(): number {
    const interval = this.reminder.intervalMinutes();
    return ['15', '30', '45', '60', '120'].includes(String(interval)) ? 30 : interval;
  }
}