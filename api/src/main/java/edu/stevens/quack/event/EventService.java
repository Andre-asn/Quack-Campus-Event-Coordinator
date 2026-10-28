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
    // The client offers up to its own clock's now + 48h, so a device a little ahead of the server still passes.
    private static final Duration CLOCK_SKEW = Duration.ofMinutes(5);

    private final EventRepository events;
    private final MapEventQuery mapEvents;
    private final CurrentUser currentUser;
    private final Clock clock;
    private final CampusProperties campus;

    public EventService(
            EventRepository events,
            MapEventQuery mapEvents,
            CurrentUser currentUser,
            Clock clock,
            CampusProperties campus) {
        this.events = events;
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
                request.startsAt() == null ? null : request.startsAt().truncatedTo(ChronoUnit.MICROS));
        validate(clean);
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
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return events.save(event);
    }

    private static String strip(String value) {
        return value == null ? null : value.strip();
    }

    // Reports every invalid field at once, so the host can fix them in one pass.
    private void validate(EventController.CreateEventRequest request) {
        List<InvalidEventException.InvalidField> errors = new ArrayList<>();
        text(errors, "title", "Title", request.title(), MAX_TEXT);
        text(errors, "description", "Description", request.description(), MAX_DESCRIPTION);
        text(errors, "locationLabel", "Location label", request.locationLabel(), MAX_TEXT);

        if (request.category() == null || request.category().isBlank()) {
            errors.add(invalid("category", "REQUIRED", "Category is required."));
        } else if (!CATEGORIES.contains(request.category())) {
            errors.add(invalid("category", "UNKNOWN_CATEGORY",
                    "Category must be one of " + String.join(", ", CATEGORIES) + "."));
        }

        if (request.startsAt() == null) {
            errors.add(invalid("startsAt", "REQUIRED", "Start time is required."));
        } else if (request.startsAt().isAfter(clock.instant().plus(MAX_AHEAD).plus(CLOCK_SKEW))) {
            errors.add(invalid("startsAt", "TOO_FAR_AHEAD", "Start time must be at most 48 hours ahead."));
        }

        if (request.latitude() == null) {
            errors.add(invalid("latitude", "REQUIRED", "Latitude is required."));
        }
        if (request.longitude() == null) {
            errors.add(invalid("longitude", "REQUIRED", "Longitude is required."));
        }
        // One error for the pin as a whole: the client places it on the map, not as two numbers.
        if (request.latitude() != null && request.longitude() != null
                && !campus.contains(request.latitude(), request.longitude())) {
            errors.add(invalid("location", "OUTSIDE_CAMPUS", "The pin must be on the Stevens campus."));
        }

        if (!errors.isEmpty()) {
            throw new InvalidEventException(errors);
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

    @Transactional(readOnly = true)
    public MapQueryResult map(String bbox, String fromText, String toText, String limitText, String cursor) {
        currentUser.require();
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
                bounds[0], bounds[1], bounds[2], bounds[3], from, to, cursorStartsAt, cursorId, limit + 1);
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
