package edu.stevens.quack.event;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import edu.stevens.quack.auth.CurrentUser;
import edu.stevens.quack.user.User;

@Service
public class ReminderService {

    private final EventService events;
    private final AttendanceRepository attendance;
    private final ReminderRepository reminders;
    private final CurrentUser currentUser;
    private final java.time.Clock clock;

    public ReminderService(
            EventService events,
            AttendanceRepository attendance,
            ReminderRepository reminders,
            CurrentUser currentUser,
            java.time.Clock clock) {
        this.events = events;
        this.attendance = attendance;
        this.reminders = reminders;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public ReminderChoice read(String idText, String token) {
        User viewer = currentUser.require();
        Event event = events.visibleEvent(idText, token);
        return new ReminderChoice(reminders.leadMinutes(event.getId(), viewer.getId()));
    }

    @Transactional
    public ReminderChoice save(String idText, String token, Integer leadMinutes) {
        User viewer = currentUser.require();
        Event event = events.visibleEventForUpdate(idText, token);
        if (leadMinutes == null || (leadMinutes != 15 && leadMinutes != 60)) {
            throw new EventStateException(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "INVALID_REMINDER",
                    "Choose a reminder 15 or 60 minutes before the event.");
        }
        if ("cancelled".equals(event.getStatus())) {
            throw new EventStateException(
                    HttpStatus.CONFLICT, "EVENT_CANCELLED", "Cancelled events can't send a reminder.");
        }
        if (!attendance.isAttending(event.getId(), viewer.getId())) {
            throw new EventStateException(
                    HttpStatus.CONFLICT, "NOT_ATTENDING", "Reminders are only for events you have joined.");
        }
        Instant fireAt = event.getStartsAt().minus(leadMinutes, ChronoUnit.MINUTES);
        if (!fireAt.isAfter(clock.instant())) {
            throw new EventStateException(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "REMINDER_TOO_LATE",
                    "That reminder would already be in the past.");
        }
        reminders.save(event.getId(), viewer.getId(), leadMinutes, clock.instant().truncatedTo(ChronoUnit.MICROS));
        return new ReminderChoice(leadMinutes);
    }

    @Transactional
    public void delete(String idText, String token) {
        User viewer = currentUser.require();
        Event event = events.visibleEventForUpdate(idText, token);
        reminders.deleteForUser(event.getId(), viewer.getId());
    }

    public record ReminderChoice(Integer leadMinutes) {
    }
}
