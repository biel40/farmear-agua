package es.farmearagua.app;

/** The cadence is stored explicitly so it survives restarts and overdue alarms. */
final class HydrationReminderSchedule {
    static final long MAX_DATE_MILLIS = 8_640_000_000_000_000L;

    final int intervalMinutes;
    final long nextReminderAt;

    HydrationReminderSchedule(int intervalMinutes, long nextReminderAt) {
        if (intervalMinutes < 1 || intervalMinutes > 1_440) {
            throw new IllegalArgumentException("El intervalo debe estar entre 1 y 1440 minutos.");
        }
        if (nextReminderAt <= 0 || nextReminderAt > MAX_DATE_MILLIS) {
            throw new IllegalArgumentException("La fecha del próximo aviso no es válida.");
        }
        this.intervalMinutes = intervalMinutes;
        this.nextReminderAt = nextReminderAt;
    }

    static HydrationReminderSchedule fromStored(boolean active, int intervalMinutes, long nextReminderAt) {
        if (!active) return null;
        try {
            return new HydrationReminderSchedule(intervalMinutes, nextReminderAt);
        } catch (IllegalArgumentException exception) {
            return null;
        }
    }

    /** Keep the original phase, skipping missed occurrences instead of sending a burst. */
    long nextAfter(long now) {
        if (nextReminderAt > now) return nextReminderAt;
        long intervalMillis = intervalMinutes * 60_000L;
        long missedIntervals = (now - nextReminderAt) / intervalMillis;
        return nextReminderAt + (missedIntervals + 1) * intervalMillis;
    }
}
