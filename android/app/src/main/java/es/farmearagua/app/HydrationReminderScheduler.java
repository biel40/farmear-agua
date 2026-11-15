package es.farmearagua.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

final class HydrationReminderScheduler {
    static final String ALARM_ACTION = "es.farmearagua.app.HYDRATION_REMINDER";
    static final String EXTRA_SCHEDULED_AT = "scheduled_at";
    private static final String CHANNEL_ID = "hydration-reminders";
    private static final String PREFERENCES = "hydration-native-reminders";
    private static final String ACTIVE = "active";
    private static final String INTERVAL = "intervalMinutes";
    private static final String NEXT_AT = "nextReminderAt";
    private static final int NOTIFICATION_ID = 7_001;
    private static final int TEST_NOTIFICATION_ID = 7_002;

    private HydrationReminderScheduler() {}

    static synchronized HydrationReminderSchedule schedule(Context context, int intervalMinutes, Long requestedAt) {
        requireNotifications(context);
        long now = System.currentTimeMillis();
        long firstAt = requestedAt == null ? now + intervalMinutes * 60_000L : requestedAt;
        HydrationReminderSchedule requested = new HydrationReminderSchedule(intervalMinutes, firstAt);
        HydrationReminderSchedule state = new HydrationReminderSchedule(intervalMinutes, requested.nextAfter(now));
        persist(context, state);
        try {
            arm(context, state.nextReminderAt);
        } catch (RuntimeException exception) {
            cancel(context);
            throw exception;
        }
        return state;
    }

    static synchronized void cancel(Context context) {
        // Clear the preference first, so an already-dispatched receiver cannot
        // rearm a reminder after the user pauses it.
        if (!preferences(context).edit().clear().commit()) {
            throw new IllegalStateException("No se pudo guardar la pausa del recordatorio.");
        }
        cancelAlarm(context);
        context.getSystemService(NotificationManager.class).cancel(NOTIFICATION_ID);
    }

    static synchronized HydrationReminderSchedule getSchedule(Context context) {
        SharedPreferences preferences = preferences(context);
        return HydrationReminderSchedule.fromStored(
            preferences.getBoolean(ACTIVE, false),
            preferences.getInt(INTERVAL, 0),
            preferences.getLong(NEXT_AT, 0L)
        );
    }

    static synchronized void restore(Context context) {
        HydrationReminderSchedule stored = getSchedule(context);
        if (stored == null) {
            cancelAlarm(context);
            return;
        }
        HydrationReminderSchedule restored = new HydrationReminderSchedule(
            stored.intervalMinutes, stored.nextAfter(System.currentTimeMillis())
        );
        persist(context, restored);
        arm(context, restored.nextReminderAt);
    }

    static synchronized void onAlarm(Context context, long expectedAt) {
        HydrationReminderSchedule stored = getSchedule(context);
        if (stored == null || stored.nextReminderAt != expectedAt) return;

        long now = System.currentTimeMillis();
        if (now < stored.nextReminderAt) {
            arm(context, stored.nextReminderAt);
            return;
        }

        // Always rearm natively before publishing. Missing permission, a blocked
        // channel or a closed app must not break the recurring schedule.
        HydrationReminderSchedule next = new HydrationReminderSchedule(
            stored.intervalMinutes, stored.nextAfter(now)
        );
        persist(context, next);
        arm(context, next.nextReminderAt);
        if (notificationsEnabled(context)) {
            show(context, NOTIFICATION_ID, false);
        }
    }

    static synchronized void showTest(Context context) {
        requireNotifications(context);
        show(context, TEST_NOTIFICATION_ID, true);
    }

    static boolean notificationsEnabled(Context context) {
        ensureChannel(context);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL_ID);
            return channel != null && channel.getImportance() != NotificationManager.IMPORTANCE_NONE;
        }
        return true;
    }

    private static void requireNotifications(Context context) {
        if (!notificationsEnabled(context)) {
            throw new SecurityException("Activa las notificaciones y el canal de recordatorios en los ajustes de Android.");
        }
    }

    private static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID, "Recordatorios de hidratación", NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Avisos para beber agua durante el día");
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    private static void show(Context context, int id, boolean test) {
        Intent openApp = new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_MAIN)
            .addCategory(Intent.CATEGORY_LAUNCHER)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent tap = PendingIntent.getActivity(
            context, id, openApp, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification_water)
            .setContentTitle(test ? "💧 Notificación de prueba" : "💧 Hora de beber agua")
            .setContentText(test
                ? "Los avisos de Farmear Agua están activados."
                : "Toca beber un poco de agua. Tu yo del futuro te lo agradecerá.")
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setOnlyAlertOnce(false)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL);
        context.getSystemService(NotificationManager.class).notify(id, builder.build());
    }

    private static void arm(Context context, long nextAt) {
        Intent intent = alarmIntent(context).putExtra(EXTRA_SCHEDULED_AT, nextAt);
        PendingIntent alarm = PendingIntent.getBroadcast(
            context, NOTIFICATION_ID, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        // A one-shot wakeup alarm honors idle mode; setRepeating(RTC) does not.
        // Android still batches/throttles these inexact alarms to save battery.
        context.getSystemService(AlarmManager.class).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextAt, alarm);
    }

    private static void cancelAlarm(Context context) {
        PendingIntent alarm = PendingIntent.getBroadcast(
            context, NOTIFICATION_ID, alarmIntent(context), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
        if (alarm != null) {
            context.getSystemService(AlarmManager.class).cancel(alarm);
            alarm.cancel();
        }
    }

    private static Intent alarmIntent(Context context) {
        return new Intent(context, HydrationReminderReceiver.class).setAction(ALARM_ACTION);
    }

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    private static void persist(Context context, HydrationReminderSchedule state) {
        if (!preferences(context).edit()
            .putBoolean(ACTIVE, true)
            .putInt(INTERVAL, state.intervalMinutes)
            .putLong(NEXT_AT, state.nextReminderAt)
            .commit()) {
            throw new IllegalStateException("No se pudo guardar el recordatorio.");
        }
    }
}
