package edu.stevens.quack.event;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import edu.stevens.quack.auth.CurrentUser;
import edu.stevens.quack.user.User;
import edu.stevens.quack.user.UserRepository;

@Service
public class EventService {

    static final ZoneId CAMPUS = ZoneId.of("America/New_York");
    private static final int MAX_LIMIT = 100;
    // Matches the events_category_check constraint in V3__create_events.sql.
    private static final List<String> CATEGORIES = List.of("study", "food", "sports", "games", "movie", "music", "other");
    private static final int MAX_DESCRIPTION = 140;
    // The varchar(255) columns for title and location_label.
    private static final int MAX_TEXT = 255;
    private static final Duration MAX_AHEAD = Duration.ofHours(48);
    // "Starting now" from a phone whose clock is a few minutes behind the server still passes. The 48h limit
    // stays exact; the client caps its picker a few minutes early instead.
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(5);
    private static final String PUBLIC = "public";
    private static final String LINK_ONLY = "link_only";

    private final EventRepository events;
    private final UserRepository users;
    private final AttendanceRepository attendance;
    private final MapEventQuery mapEvents;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final CampusProperties campus;

    public EventService(
            EventRepository events,
            UserRepository users,
            AttendanceRepository attendance,
            MapEventQuery mapEvents,
            CurrentUser currentUser,
            Clock clock,
            CampusProperties campus) {
        this.events = events;
        this.users = users;
        this.attendance = attendance;
        this.mapEvents = mapEvents;
        this.currentUser = currentUser;
        this.clock = clock;
        this.campus = campus;
    }

    @Transactional
    public Event create(EventController.CreateEventRequest request) {
        User host = currentUser.require();
        // Postgres stores timestamp(6), so keep microseconds or the read-back value drifts.
        EventController.CreateEventRequest clean = new EventController.CreateEventRequest(
                strip(request.title()),
                strip(request.description()),
                request.category(),
                request.latitude(),
                request.longitude(),
                strip(request.locationLabel()),
                micros(request.startsAt()),
                micros(request.endsAt()),
                request.visibility() == null ? null : request.visibility().strip());
        String visibility = validateCreate(clean);
        // Only a link-only event needs a token, and the token is never written to a log.
        UUID shareToken = LINK_ONLY.equals(visibility) ? UUID.randomUUID() : null;
        Event event = Event.create(
                UUID.randomUUID(),
                host.getId(),
                clean.title(),
                clean.description(),
                clean.category(),
                clean.latitude(),
                clean.longitude(),
                clean.locationLabel(),
                clean.startsAt(),
                clean.endsAt(),
                visibility,
                shareToken,
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return events.save(event);
    }

    @Transactional
    public Event update(UUID id, EventController.EditEventRequest request) {
        User caller = currentUser.require();
        Event event = events.findById(id).orElseThrow(EventService::missing);
        if (!event.getHostId().equals(caller.getId())) {
            // A link-only event is invisible without its token, so a miss and a refusal look the same.
            if (LINK_ONLY.equals(event.getVisibility())) {
                throw missing();
            }
            throw new EventStateException(HttpStatus.FORBIDDEN, "NOT_HOST", "Only the host can edit this event.");
        }
        if ("cancelled".equals(event.getStatus())) {
            throw new EventStateException(
                    HttpStatus.CONFLICT, "EVENT_CANCELLED", "Cancelled events can't be edited.");
        }
        EventController.EditEventRequest clean = new EventController.EditEventRequest(
                strip(request.title()),
                strip(request.description()),
                request.category(),
                request.latitude(),
                request.longitude(),
                strip(request.locationLabel()),
                micros(request.startsAt()));
        validateEdit(clean, event.getStartsAt(), event.getEndsAt());
        event.change(
                clean.title(),
                clean.description(),
                clean.category(),
                clean.latitude(),
                clean.longitude(),
                clean.locationLabel(),
                clean.startsAt(),
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return events.save(event);
    }

    private static Instant micros(Instant value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.MICROS);
    }

    private static EventStateException missing() {
        return new EventStateException(HttpStatus.NOT_FOUND, "EVENT_NOT_FOUND", "No event with that id.");
    }

    private static String strip(String value) {
        return value == null ? null : value.strip();
    }

    // An omitted visibility stays public. Any other value is rejected with the field errors.
    private String validateCreate(EventController.CreateEventRequest request) {
        List<InvalidEventException.InvalidField> errors = new ArrayList<>();
        fields(errors, request.title(), request.description(), request.category(), request.latitude(),
                request.longitude(), request.locationLabel(), request.startsAt(), null);
        if (request.endsAt() == null) {
            errors.add(invalid("endsAt", "REQUIRED", "End time is required."));
        } else if (request.startsAt() != null && !request.startsAt().isBefore(request.endsAt())) {
            errors.add(invalid("endsAt", "NOT_AFTER_START", "End time must be after start time."));
        }
        String visibility = PUBLIC;
        if (request.visibility() != null) {
            if (PUBLIC.equals(request.visibility()) || LINK_ONLY.equals(request.visibility())) {
                visibility = request.visibility();
            } else {
                errors.add(invalid("visibility", "INVALID_VISIBILITY", "Visibility must be public or link_only."));
            }
        }
        if (!errors.isEmpty()) {
            throw new InvalidEventException(errors);
        }
        return visibility;
    }

    // A started event keeps its past start time. Moving the start still has to land inside the window
    // and before the end time the event already has.
    private void validateEdit(EventController.EditEventRequest request, Instant storedStart, Instant storedEnd) {
        List<InvalidEventException.InvalidField> errors = new ArrayList<>();
        fields(errors, request.title(), request.description(), request.category(), request.latitude(),
                request.longitude(), request.locationLabel(), request.startsAt(), storedStart);
        if (storedEnd != null && request.startsAt() != null
                && !request.startsAt().isBefore(storedEnd.truncatedTo(ChronoUnit.MICROS))) {
            errors.add(invalid("startsAt", "NOT_BEFORE_END", "Start time must be before the end time."));
        }
        if (!errors.isEmpty()) {
            throw new InvalidEventException(errors);
        }
    }

    // Reports every invalid field at once, so the host can fix them in one pass.
    private void fields(
            List<InvalidEventException.InvalidField> errors,
            String title,
            String description,
            String category,
            Double latitude,
            Double longitude,
            String locationLabel,
            Instant startsAt,
            Instant unchangedStart) {
        text(errors, "title", "Title", title, MAX_TEXT);
        text(errors, "description", "Description", description, MAX_DESCRIPTION);
        text(errors, "locationLabel", "Location label", locationLabel, MAX_TEXT);

        if (category == null || category.isBlank()) {
            errors.add(invalid("category", "REQUIRED", "Category is required."));
        } else if (!CATEGORIES.contains(category)) {
            errors.add(invalid("category", "UNKNOWN_CATEGORY",
                    "Category must be one of " + String.join(", ", CATEGORIES) + "."));
        }

        if (startsAt == null) {
            errors.add(invalid("startsAt", "REQUIRED", "Start time is required."));
        } else if (unchangedStart != null && startsAt.equals(unchangedStart.truncatedTo(ChronoUnit.MICROS))) {
            // Keeping the time an event already has is not a new start.
        } else if (startsAt.isBefore(clock.instant().minus(CLOCK_SKEW))) {
            errors.add(invalid("startsAt", "IN_PAST", "Start time can't be in the past."));
        } else if (startsAt.isAfter(clock.instant().plus(MAX_AHEAD))) {
            errors.add(invalid("startsAt", "TOO_FAR_AHEAD", "Start time must be at most 48 hours ahead."));
        }

        if (latitude == null) {
            errors.add(invalid("latitude", "REQUIRED", "Latitude is required."));
        }
        if (longitude == null) {
            errors.add(invalid("longitude", "REQUIRED", "Longitude is required."));
        }
        // One error for the pin as a whole: the client places it on the map, not as two numbers.
        if (latitude != null && longitude != null && !campus.contains(latitude, longitude)) {
            errors.add(invalid("location", "OUTSIDE_CAMPUS", "The pin must be on the Stevens campus."));
        }
    }

    private static void text(
            List<InvalidEventException.InvalidField> errors, String field, String name, String value, int max) {
        if (value == null || value.isBlank()) {
            errors.add(invalid(field, "REQUIRED", name + " is required."));
        } else if (value.codePointCount(0, value.length()) > max) {
            // Code points, because Postgres varchar limits count characters, not UTF-16 units.
            errors.add(invalid(field, "TOO_LONG", name + " must be at most " + max + " characters."));
        }
    }

    private static InvalidEventException.InvalidField invalid(String field, String code, String detail) {
        return new InvalidEventException.InvalidField(field, code, detail);
    }

    // Cancelled events are returned with their status, not hidden. A link-only event needs its share token,
    // even for the host; anything else, including a tampered or malformed token, is a 404.
    @Transactional(readOnly = true)
    public EventDetail detail(String idText, String token) {
        User viewer = currentUser.require();
        UUID id = uuidOrNull(idText);
        if (id == null) {
            throw new EventNotFoundException();
        }
        Event event = events.findById(id).orElseThrow(EventNotFoundException::new);
        if ("link_only".equals(event.getVisibility()) && !opens(event, token)) {
            throw new EventNotFoundException();
        }
        User host = users.findById(event.getHostId()).orElseThrow(EventNotFoundException::new);
        // The share token goes back only to the host, so they can copy the link again.
        UUID shareToken = viewer.getId().equals(event.getHostId()) ? event.getShareToken() : null;
        return new EventDetail(
                event.getId(),
                event.getTitle(),
                event.getDescription(),
                event.getCategory(),
                event.getLocationLabel(),
                event.getStartsAt(),
                event.getEndsAt(),
                event.getStatus(),
                new EventDetail.Host(host.getDisplayName(), host.getAvatarUrl()),
                attendance.countByEventId(event.getId()),
                event.getVisibility(),
                shareToken,
                attendance.isAttending(event.getId(), viewer.getId()));
    }

    private static boolean opens(Event event, String token) {
        UUID given = uuidOrNull(token);
        if (given == null || event.getShareToken() == null) {
            return false;
        }
        return MessageDigest.isEqual(
                event.getShareToken().toString().getBytes(StandardCharsets.US_ASCII),
                given.toString().getBytes(StandardCharsets.US_ASCII));
    }

    private static UUID uuidOrNull(String text) {
        if (text == null || text.isBlank()) {
            return null;
        }
        try {
            UUID parsed = UUID.fromString(text.trim());
            // UUID.fromString accepts short groups like "1-1-1-1-1"; only the canonical form names an event.
            return parsed.toString().equalsIgnoreCase(text.trim()) ? parsed : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    @Transactional(readOnly = true)
    public MapQueryResult map(String bbox, String fromText, String toText, String limitText, String cursor) {
        // Link-only events stay off every map except their host's. The check lives here, not in the client.
        User viewer = currentUser.require();
        double[] bounds = bounds(bbox);
        Instant from = instant(fromText, "from");
        Instant to = instant(toText, "to");
        if (!from.isBefore(to)) {
            throw new MapQueryException(HttpStatus.UNPROCESSABLE_CONTENT, "INVALID_RANGE",
                    "from must be before to.");
        }
        LocalDate today = LocalDate.now(clock.withZone(CAMPUS));
        Instant earliest = today.minusDays(1).atStartOfDay(CAMPUS).toInstant();
        Instant latest = today.plusDays(2).atStartOfDay(CAMPUS).toInstant();
        if (from.isBefore(earliest) || !from.isBefore(latest) || to.isAfter(latest)) {
            throw new MapQueryException(HttpStatus.UNPROCESSABLE_CONTENT, "DATE_OUT_OF_RANGE",
                    "Map queries are limited to yesterday, today, and tomorrow.");
        }
        int limit = limit(limitText);
        Instant cursorStartsAt = null;
        UUID cursorId = null;
        if (cursor != null && !cursor.isBlank()) {
            String[] parts = cursor.split("\\|", 2);
            if (parts.length != 2) {
                throw malformed("cursor is not a map page token.");
            }
            try {
                cursorStartsAt = Instant.EPOCH.plus(Long.parseLong(parts[0]), ChronoUnit.MICROS);
                cursorId = UUID.fromString(parts[1]);
            } catch (RuntimeException ex) {
                throw malformed("cursor is not a map page token.");
            }
        }
        List<MapEventPage.MapPin> rows = mapEvents.find(
                bounds[0], bounds[1], bounds[2], bounds[3], from, to, cursorStartsAt, cursorId, viewer.getId(), limit + 1);
        String nextCursor = null;
        if (rows.size() > limit) {
            MapEventPage.MapPin last = rows.get(limit - 1);
            nextCursor = last.startsAt().getEpochSecond() * 1_000_000L
                    + last.startsAt().getNano() / 1_000
                    + "|" + last.id();
            rows = rows.subList(0, limit);
        }
        MapEventPage page = new MapEventPage(List.copyOf(rows), nextCursor);
        return new MapQueryResult(page, etag(page));
    }

    private double[] bounds(String bbox) {
        if (bbox == null || bbox.isBlank()) {
            throw malformed("bbox is required.");
        }
        String[] parts = bbox.split(",");
        if (parts.length != 4) {
            throw malformed("bbox must be west,south,east,north.");
        }
        double west;
        double south;
        double east;
        double north;
        try {
            west = Double.parseDouble(parts[0].trim());
            south = Double.parseDouble(parts[1].trim());
            east = Double.parseDouble(parts[2].trim());
            north = Double.parseDouble(parts[3].trim());
        } catch (NumberFormatException ex) {
            throw malformed("bbox must be west,south,east,north.");
        }
        if (Double.isNaN(west) || Double.isNaN(south) || Double.isNaN(east) || Double.isNaN(north)
                || west > east || south > north
                || south < -90 || north > 90 || west < -180 || east > 180) {
            throw malformed("bbox must be west,south,east,north.");
        }
        return new double[] {west, south, east, north};
    }

    private Instant instant(String text, String name) {
        if (text == null || text.isBlank()) {
            throw malformed(name + " is required.");
        }
        try {
            return Instant.parse(text);
        } catch (DateTimeParseException ex) {
            throw malformed(name + " must be an RFC 3339 timestamp.");
        }
    }

    private int limit(String text) {
        if (text == null || text.isBlank()) {
            throw malformed("limit is required.");
        }
        try {
            int limit = Integer.parseInt(text);
            if (limit < 1 || limit > MAX_LIMIT) {
                throw malformed("limit must be from 1 to 100.");
            }
            return limit;
        } catch (NumberFormatException ex) {
            throw malformed("limit must be from 1 to 100.");
        }
    }

    private static void field(MessageDigest digest, String value) {
        digest.update(value.getBytes(StandardCharsets.UTF_8));
        digest.update((byte) 0);
    }

    private static MapQueryException malformed(String detail) {
        return new MapQueryException(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", detail);
    }

    private static String etag(MapEventPage page) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (MapEventPage.MapPin pin : page.events()) {
                field(digest, pin.id().toString());
                field(digest, pin.title());
                field(digest, pin.category());
                field(digest, pin.visibility());
                field(digest, String.valueOf(pin.shareToken()));
                field(digest, pin.startsAt().toString());
                field(digest, pin.host().displayName());
                field(digest, String.valueOf(pin.host().avatarUrl()));
                field(digest, Double.toString(pin.latitude()));
                field(digest, Double.toString(pin.longitude()));
            }
            field(digest, String.valueOf(page.nextCursor()));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    public record MapQueryResult(MapEventPage page, String etag) {
    }
}
