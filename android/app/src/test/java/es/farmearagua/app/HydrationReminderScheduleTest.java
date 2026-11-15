package es.farmearagua.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;

import org.junit.Test;

public class HydrationReminderScheduleTest {
    private static final long FIRST_AT = 1_800_000_000_000L;
    private static final long HALF_HOUR = 30 * 60_000L;

    @Test
    public void futureReminderKeepsItsOriginalTime() {
        HydrationReminderSchedule state = new HydrationReminderSchedule(30, FIRST_AT);
        assertEquals(FIRST_AT, state.nextAfter(FIRST_AT - 1));
    }

    @Test
    public void delayedAlarmKeepsPhaseAndSkipsAllMissedOccurrences() {
        HydrationReminderSchedule state = new HydrationReminderSchedule(30, FIRST_AT);
        long deliveredAt = FIRST_AT + 3 * HALF_HOUR + 10 * 60_000L;
        assertEquals(FIRST_AT + 4 * HALF_HOUR, state.nextAfter(deliveredAt));
    }

    @Test
    public void exactBoundarySchedulesFollowingOccurrence() {
        HydrationReminderSchedule state = new HydrationReminderSchedule(30, FIRST_AT);
        assertEquals(FIRST_AT + HALF_HOUR, state.nextAfter(FIRST_AT));
        assertEquals(FIRST_AT + 3 * HALF_HOUR, state.nextAfter(FIRST_AT + 2 * HALF_HOUR));
    }

    @Test
    public void rebootDoesNotReplaceOriginalIntervalWithCatchupDelay() {
        HydrationReminderSchedule stored = HydrationReminderSchedule.fromStored(true, 30, FIRST_AT);
        assertNotNull(stored);
        long restoredAt = stored.nextAfter(FIRST_AT + 5 * HALF_HOUR + 15_000L);
        HydrationReminderSchedule restored = new HydrationReminderSchedule(stored.intervalMinutes, restoredAt);
        assertEquals(30, restored.intervalMinutes);
        assertEquals(FIRST_AT + 6 * HALF_HOUR, restored.nextReminderAt);
        assertEquals(FIRST_AT + 7 * HALF_HOUR, restored.nextAfter(restored.nextReminderAt));
    }

    @Test
    public void pausedOrCorruptStateCannotRestoreAnAlarm() {
        assertNull(HydrationReminderSchedule.fromStored(false, 30, FIRST_AT));
        assertNull(HydrationReminderSchedule.fromStored(true, 0, FIRST_AT));
        assertNull(HydrationReminderSchedule.fromStored(true, 30, 0));
        assertNull(HydrationReminderSchedule.fromStored(true, 30, Long.MAX_VALUE));
    }

    @Test
    public void onlySupportedIntervalsAndDatesAreAccepted() {
        assertNotNull(new HydrationReminderSchedule(1, FIRST_AT));
        assertNotNull(new HydrationReminderSchedule(1_440, FIRST_AT));
        assertThrows(IllegalArgumentException.class, () -> new HydrationReminderSchedule(0, FIRST_AT));
        assertThrows(IllegalArgumentException.class, () -> new HydrationReminderSchedule(1_441, FIRST_AT));
        assertThrows(IllegalArgumentException.class, () -> new HydrationReminderSchedule(30, -1));
    }
}
