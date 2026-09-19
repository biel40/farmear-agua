import { Component } from '@angular/core';
import { HydrationReminderComponent } from './features/hydration/components/hydration-reminder/hydration-reminder.component';

@Component({
  imports: [HydrationReminderComponent],
  selector: 'app-root',
  styleUrl: './app.css',
  template: '<app-hydration-reminder />',
})
export class App {}
