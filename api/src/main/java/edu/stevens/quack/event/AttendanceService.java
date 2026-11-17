package edu.stevens.quack.event;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
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
     *
     * @param eventId event to join
     * @param token optional share token for link-only events
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

    /**
     * Removes the signed-in user's attendance. Leaving is allowed after cancellation or event end.
     *
     * @param eventId event to leave
     * @param token optional share token for link-only events
     */
    @Transactional
    public void leave(UUID eventId, String token) {
        User user = currentUser.require();

        Event event = events.findById(eventId)
                .orElseThrow(AttendanceService::notFound);

        if ("link_only".equals(event.getVisibility())
                && !matchesToken(event.getShareToken(), token)) {
            throw notFound();
        }

        if (event.getHostId().equals(user.getId())) {
            throw new AttendanceException(
                    HttpStatus.CONFLICT,
                    "HOST_CANNOT_LEAVE",
                    "The event host cannot leave their own event.");
        }

        attendance.leave(eventId, user.getId());
    }

    /**
     * Returns attendee names only to the host or a current attendee. Link-only visibility
     * is checked before membership, so inaccessible events never reveal attendance data.
     */
    @Transactional(readOnly = true)
    public AttendanceController.AttendanceResponse list(UUID eventId, String token) {
        User viewer = currentUser.require();
        Event event = events.findById(eventId).orElseThrow(AttendanceService::notFound);

        if ("link_only".equals(event.getVisibility())
                && !matchesToken(event.getShareToken(), token)) {
            throw notFound();
        }

        List<AttendanceRepository.AttendanceSnapshotRow> rows = attendance.snapshot(eventId, viewer.getId());
        AttendanceRepository.AttendanceSnapshotRow first = rows.get(0);
        if (!event.getHostId().equals(viewer.getId()) && !first.viewerJoined()) {
            throw new AttendanceException(
                    HttpStatus.FORBIDDEN,
                    "ATTENDEE_LIST_FORBIDDEN",
                    "Only the event host and attendees can see attendee names.");
        }

        List<String> names = new ArrayList<>();
        for (AttendanceRepository.AttendanceSnapshotRow row : rows) {
            if (row.displayName() != null) {
                names.add(row.displayName());
            }
        }
        return new AttendanceController.AttendanceResponse(
                first.attendeeCount(),
                List.copyOf(names),
                first.attendeeCount() - names.size());
    }

    private static boolean matchesToken(UUID expected, String supplied) {
        if (expected == null || supplied == null) {
            return false;
        }
        try {
            String text = supplied.trim();
            UUID parsed = UUID.fromString(text);
            if (!parsed.toString().equalsIgnoreCase(text)) {
                return false;
            }
            return MessageDigest.isEqual(
                    expected.toString().getBytes(StandardCharsets.US_ASCII),
                    parsed.toString().getBytes(StandardCharsets.US_ASCII));
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
