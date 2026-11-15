package es.farmearagua.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.SystemClock;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Requires POST_NOTIFICATIONS to be granted before the instrumentation run. */
@RunWith(AndroidJUnit4.class)
public class HydrationReminderSchedulerTest {
    private static final int REMINDER_ID = 7_001;
    private static final int TEST_ID = 7_002;
    private static final long INTERVAL_MILLIS = 30 * 60_000L;

    private Context context;
    private NotificationManager notifications;

    @Before
    public void setUp() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        notifications = context.getSystemService(NotificationManager.class);
        HydrationReminderScheduler.cancel(context);
        notifications.cancel(TEST_ID);
        awaitNotificationRemoved(REMINDER_ID);
        awaitNotificationRemoved(TEST_ID);
        assertTrue("Concede POST_NOTIFICATIONS y activa el canal antes del runner.",
            HydrationReminderScheduler.notificationsEnabled(context));
    }

    @After
    public void tearDown() {
        HydrationReminderScheduler.cancel(context);
        notifications.cancel(TEST_ID);
    }

    @Test
    public void receiverWaitsUntilDueThenRearmsWithoutLosingCadence() {
        long requestedAt = System.currentTimeMillis() + 2_000L;
        HydrationReminderSchedule scheduled = HydrationReminderScheduler.schedule(context, 30, requestedAt);
        assertEquals(30, scheduled.intervalMinutes);
        assertEquals(requestedAt, scheduled.nextReminderAt);
        assertEquals(requestedAt, HydrationReminderScheduler.getSchedule(context).nextReminderAt);
        assertNotNull(alarmPendingIntent());

        HydrationReminderReceiver receiver = new HydrationReminderReceiver();
        receiver.onReceive(context, alarmIntent(requestedAt));
        assertEquals(requestedAt, HydrationReminderScheduler.getSchedule(context).nextReminderAt);
        assertNull(findNotification(REMINDER_ID));

        // Simulate a delivery delayed by more than two periods without waiting
        // for Android's inexact-alarm window or changing the device clock.
        long overdueAt = System.currentTimeMillis() - 61 * 60_000L;
        saveFixture(30, overdueAt);
        receiver.onReceive(context, alarmIntent(overdueAt));

        HydrationReminderSchedule rearmed = HydrationReminderScheduler.getSchedule(context);
        assertNotNull(rearmed);
        assertEquals(30, rearmed.intervalMinutes);
        assertEquals(overdueAt + 3 * INTERVAL_MILLIS, rearmed.nextReminderAt);
        assertTrue(rearmed.nextReminderAt > System.currentTimeMillis());
        assertNotNull(alarmPendingIntent());
        assertNotNull(awaitNotification(REMINDER_ID));
        assertEquals(1, notifications.getActiveNotifications().length);

        // A stale duplicate delivery cannot advance the new schedule again.
        receiver.onReceive(context, alarmIntent(overdueAt));
        assertEquals(rearmed.nextReminderAt, HydrationReminderScheduler.getSchedule(context).nextReminderAt);
    }

    @Test
    public void realTestNotificationCanAlertRepeatedlyAndOpenTheApplication() {
        HydrationReminderScheduler.showTest(context);
        Notification notification = awaitNotification(TEST_ID).getNotification();
        assertFalse((notification.flags & Notification.FLAG_ONLY_ALERT_ONCE) != 0);
        assertTrue((notification.flags & Notification.FLAG_AUTO_CANCEL) != 0);
        assertNotNull(notification.contentIntent);
        assertNotNull(notification.getSmallIcon());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            assertEquals("hydration-reminders", notification.getChannelId());
        }
        assertEquals("💧 Notificación de prueba", notification.extras.getCharSequence(Notification.EXTRA_TITLE));
        assertNull(HydrationReminderScheduler.getSchedule(context));
        assertNull(alarmPendingIntent());
    }

    @Test
    public void cancellingClearsAlarmNotificationAndStateAndRestoreKeepsItPaused() {
        long overdueAt = System.currentTimeMillis() - 1_000L;
        saveFixture(30, overdueAt);
        HydrationReminderScheduler.onAlarm(context, overdueAt);
        assertNotNull(awaitNotification(REMINDER_ID));
        assertNotNull(alarmPendingIntent());

        HydrationReminderScheduler.cancel(context);
        assertNull(HydrationReminderScheduler.getSchedule(context));
        assertTrue(preferences().getAll().isEmpty());
        assertNull(alarmPendingIntent());
        awaitNotificationRemoved(REMINDER_ID);

        HydrationReminderScheduler.restore(context);
        assertNull(HydrationReminderScheduler.getSchedule(context));
        assertNull(alarmPendingIntent());
        assertNull(findNotification(REMINDER_ID));
    }

    @Test
    public void restoringOverdueStateKeepsOriginalIntervalAndPhaseWithoutPublishingBacklog() {
        long anchor = System.currentTimeMillis() - 95 * 60_000L;
        saveFixture(30, anchor);

        HydrationReminderScheduler.restore(context);

        HydrationReminderSchedule restored = HydrationReminderScheduler.getSchedule(context);
        assertNotNull(restored);
        assertEquals(30, restored.intervalMinutes);
        assertEquals(anchor + 4 * INTERVAL_MILLIS, restored.nextReminderAt);
        assertNotNull(alarmPendingIntent());
        assertNull(findNotification(REMINDER_ID));

        HydrationReminderScheduler.restore(context);
        assertEquals(restored.nextReminderAt, HydrationReminderScheduler.getSchedule(context).nextReminderAt);
        assertEquals(30, HydrationReminderScheduler.getSchedule(context).intervalMinutes);
    }

    private void saveFixture(int intervalMinutes, long nextAt) {
        assertTrue(preferences().edit()
            .putBoolean("active", true)
            .putInt("intervalMinutes", intervalMinutes)
            .putLong("nextReminderAt", nextAt)
            .commit());
    }

    private SharedPreferences preferences() {
        return context.getSharedPreferences("hydration-native-reminders", Context.MODE_PRIVATE);
    }

    private Intent alarmIntent(long expectedAt) {
        return new Intent(context, HydrationReminderReceiver.class)
            .setAction(HydrationReminderScheduler.ALARM_ACTION)
            .putExtra(HydrationReminderScheduler.EXTRA_SCHEDULED_AT, expectedAt);
    }

    private PendingIntent alarmPendingIntent() {
        return PendingIntent.getBroadcast(
            context, REMINDER_ID, alarmIntent(0), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private StatusBarNotification findNotification(int id) {
        for (StatusBarNotification notification : notifications.getActiveNotifications()) {
            if (notification.getId() == id) return notification;
        }
        return null;
    }

    private StatusBarNotification awaitNotification(int id) {
        long deadline = SystemClock.elapsedRealtime() + 2_000L;
        StatusBarNotification notification;
        do {
            notification = findNotification(id);
            if (notification != null) return notification;
            SystemClock.sleep(20L);
        } while (SystemClock.elapsedRealtime() < deadline);
        assertNotNull("Android no publicó la notificación " + id, notification);
        return notification;
    }

    private void awaitNotificationRemoved(int id) {
        long deadline = SystemClock.elapsedRealtime() + 2_000L;
        while (findNotification(id) != null && SystemClock.elapsedRealtime() < deadline) {
            SystemClock.sleep(20L);
        }
        assertNull("Android no retiró la notificación " + id, findNotification(id));
    }
}
