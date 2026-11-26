package edu.stevens.quack.event;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import edu.stevens.quack.auth.CurrentUser;
import edu.stevens.quack.user.User;

@Service
public class AnnouncementService {

    static final int MAX_BODY = 280;
    private static final int MAX_LIMIT = 20;

    private final EventService events;
    private final AnnouncementRepository announcements;
    private final CurrentUser currentUser;
    private final java.time.Clock clock;

    public AnnouncementService(
            EventService events,
            AnnouncementRepository announcements,
            CurrentUser currentUser,
            java.time.Clock clock) {
        this.events = events;
        this.announcements = announcements;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public AnnouncementController.AnnouncementPage list(String idText, String token, String limitText, String cursor) {
        Event event = events.visibleEvent(idText, token);
        int limit = limit(limitText);
        Instant cursorCreatedAt = null;
        UUID cursorId = null;
        if (cursor != null && !cursor.isBlank()) {
            String[] parts = cursor.split("\\|", 2);
            if (parts.length != 2) {
                throw malformed();
            }
            try {
                cursorCreatedAt = Instant.EPOCH.plus(Long.parseLong(parts[0]), ChronoUnit.MICROS);
                cursorId = UUID.fromString(parts[1]);
            } catch (RuntimeException ex) {
                throw malformed();
            }
        }
        List<AnnouncementController.Announcement> rows = announcements.page(
                event.getId(), cursorCreatedAt, cursorId, limit + 1);
        String nextCursor = null;
        if (rows.size() > limit) {
            AnnouncementController.Announcement last = rows.get(limit - 1);
            nextCursor = last.createdAt().getEpochSecond() * 1_000_000L
                    + last.createdAt().getNano() / 1_000
                    + "|" + last.id();
            rows = rows.subList(0, limit);
        }
        return new AnnouncementController.AnnouncementPage(List.copyOf(rows), nextCursor);
    }

    @Transactional
    public AnnouncementController.Announcement post(String idText, String body) {
        User author = currentUser.require();
        Event event = events.hostedEventForUpdate(idText, author.getId());
        if ("cancelled".equals(event.getStatus())) {
            throw new EventStateException(
                    HttpStatus.CONFLICT, "EVENT_CANCELLED", "Cancelled events can't be announced.");
        }
        String clean = body == null ? "" : body.strip();
        if (clean.isEmpty()) {
            throw new EventStateException(
                    HttpStatus.UNPROCESSABLE_CONTENT, "INVALID_ANNOUNCEMENT", "Announcement text is required.");
        }
        if (clean.codePointCount(0, clean.length()) > MAX_BODY) {
            throw new EventStateException(
                    HttpStatus.UNPROCESSABLE_CONTENT,
                    "INVALID_ANNOUNCEMENT",
                    "Announcement must be at most " + MAX_BODY + " characters.");
        }
        UUID id = UUID.randomUUID();
        Instant createdAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
        announcements.insert(id, event.getId(), author.getId(), clean, createdAt);
        return new AnnouncementController.Announcement(id, clean, createdAt);
    }

    private static int limit(String text) {
        if (text == null || text.isBlank()) {
            return MAX_LIMIT;
        }
        try {
            int limit = Integer.parseInt(text);
            if (limit < 1 || limit > MAX_LIMIT) {
                throw malformed();
            }
            return limit;
        } catch (NumberFormatException ex) {
            throw malformed();
        }
    }

    private static EventStateException malformed() {
        return new EventStateException(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", "cursor or limit is not valid.");
    }
}
