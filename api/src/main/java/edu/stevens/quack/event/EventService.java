package edu.stevens.quack.event;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
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

    private final EventRepository events;
    private final MapEventQuery mapEvents;
    private final CurrentUser currentUser;
    private final Clock clock;

    public EventService(EventRepository events, MapEventQuery mapEvents, CurrentUser currentUser, Clock clock) {
        this.events = events;
        this.mapEvents = mapEvents;
        this.currentUser = currentUser;
        this.clock = clock;
    }

    @Transactional
    public Event create(EventController.CreateEventRequest request) {
        User host = currentUser.require();
        // Postgres stores timestamp(6), so keep microseconds or the read-back value drifts.
        Event event = Event.create(
                UUID.randomUUID(),
                host.getId(),
                request.title(),
                request.description(),
                request.category(),
                request.latitude(),
                request.longitude(),
                request.locationLabel(),
                request.startsAt(),
                clock.instant().truncatedTo(ChronoUnit.MICROS));
        return events.save(event);
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

    private static MapQueryException malformed(String detail) {
        return new MapQueryException(HttpStatus.BAD_REQUEST, "MALFORMED_REQUEST", detail);
    }

    private static String etag(MapEventPage page) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (MapEventPage.MapPin pin : page.events()) {
                digest.update(pin.id().toString().getBytes(StandardCharsets.UTF_8));
                digest.update(pin.startsAt().toString().getBytes(StandardCharsets.UTF_8));
                digest.update(pin.host().displayName().getBytes(StandardCharsets.UTF_8));
                digest.update(String.valueOf(pin.host().avatarUrl()).getBytes(StandardCharsets.UTF_8));
                digest.update(Double.toString(pin.latitude()).getBytes(StandardCharsets.UTF_8));
                digest.update(Double.toString(pin.longitude()).getBytes(StandardCharsets.UTF_8));
            }
            digest.update(String.valueOf(page.nextCursor()).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest.digest());
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }

    public record MapQueryResult(MapEventPage page, String etag) {
    }
}
