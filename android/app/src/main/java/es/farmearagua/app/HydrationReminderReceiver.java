package es.farmearagua.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

/** Runs without a WebView or JavaScript process, including after a reboot. */
public class HydrationReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        try {
            String action = intent.getAction();
            if (HydrationReminderScheduler.ALARM_ACTION.equals(action)) {
                HydrationReminderScheduler.onAlarm(
                    context, intent.getLongExtra(HydrationReminderScheduler.EXTRA_SCHEDULED_AT, -1L)
                );
            } else if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action)) {
                HydrationReminderScheduler.restore(context);
            }
        } catch (RuntimeException exception) {
            Log.e("HydrationNotifications", "No se pudo procesar el recordatorio", exception);
        }
    }
}
