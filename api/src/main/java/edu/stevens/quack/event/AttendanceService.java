package edu.stevens.quack.event;

import java.time.Clock;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import edu.stevens.quack.auth.CurrentUser;
import edu.stevens.quack.user.User;

@Service
public class AttendanceService {

    private final EventRepository events;
    private final AttendanceRepository attendance;
    private final CurrentUser currentUser;
    private final Clock clock;

    public AttendanceService(
            EventRepository events,
            AttendanceRepository attendance,
            CurrentUser currentUser,
            Clock clock) {
        this.events = events;
        this.attendance = attendance;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    /**
     * Records attendance once per student. Link-only events require their
     * share token; inaccessible events use the same response as missing events.
     */
    @Transactional
    public void join(UUID eventId, String token) {
        User user = currentUser.require();

        Event event = events.findById(eventId)
                .orElseThrow(AttendanceService::notFound);

        if ("link_only".equals(event.getVisibility())
                && !matchesToken(event.getShareToken(), token)) {
            throw notFound();
        }

        if ("cancelled".equals(event.getStatus())) {
            throw new AttendanceException(
                    HttpStatus.CONFLICT,
                    "EVENT_CANCELLED",
                    "You cannot join a cancelled event.");
        }

        if (event.getEndsAt() != null && !clock.instant().isBefore(event.getEndsAt())) {
            throw new AttendanceException(
                    HttpStatus.CONFLICT,
                    "EVENT_ENDED",
                    "You cannot join an event that has ended.");
        }

        attendance.join(eventId, user.getId());
    }

    private static boolean matchesToken(UUID expected, String supplied) {
        if (expected == null || supplied == null) {
            return false;
        }
        try {
            UUID parsed = UUID.fromString(supplied);
            return parsed.toString().equalsIgnoreCase(supplied)
                    && expected.equals(parsed);
        } catch (IllegalArgumentException ex) {
            return false;
        }
    }

    private static AttendanceException notFound() {
        return new AttendanceException(
                HttpStatus.NOT_FOUND,
                "EVENT_NOT_FOUND",
                "The event does not exist.");
    }
}
