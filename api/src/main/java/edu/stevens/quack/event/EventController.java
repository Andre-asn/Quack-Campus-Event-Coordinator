package edu.stevens.quack.event;

import java.net.URI;
import java.time.Instant;
import java.util.UUID;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
@RequestMapping("/api/v1/events")
public class EventController {

    private final EventService events;

    public EventController(EventService events) {
        this.events = events;
    }

    @PostMapping
    public ResponseEntity<EventResponse> create(@RequestBody CreateEventRequest request) {
        Event event = events.create(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(event.getId())
                .toUri();
        return ResponseEntity.created(location).body(EventResponse.from(event));
    }

    @GetMapping
    public ResponseEntity<MapEventPage> map(
            @RequestParam(required = false) String bbox,
            @RequestParam(required = false) String from,
            @RequestParam(required = false) String to,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String cursor,
            @RequestHeader(value = HttpHeaders.IF_NONE_MATCH, required = false) String ifNoneMatch) {
        EventService.MapQueryResult result = events.map(bbox, from, to, limit, cursor);
        if (matches(ifNoneMatch, result.etag())) {
            return ResponseEntity.status(HttpStatus.NOT_MODIFIED).eTag(result.etag()).build();
        }
        return ResponseEntity.ok().eTag(result.etag()).body(result.page());
    }

    private static boolean matches(String ifNoneMatch, String etag) {
        if (ifNoneMatch == null || ifNoneMatch.isBlank()) {
            return false;
        }
        for (String candidate : ifNoneMatch.split(",")) {
            if (strip(candidate).equals(etag)) {
                return true;
            }
        }
        return false;
    }

    private static String strip(String value) {
        String token = value.trim();
        if (token.startsWith("W/")) {
            token = token.substring(2).trim();
        }
        if (token.length() >= 2 && token.startsWith("\"") && token.endsWith("\"")) {
            token = token.substring(1, token.length() - 1);
        }
        return token;
    }

    // shortcut: field rules (48h, 140 chars, category, campus bbox, required fields) land with #36.
    public record CreateEventRequest(
            String title,
            String description,
            String category,
            double latitude,
            double longitude,
            String locationLabel,
            Instant startsAt) {
    }

    public record EventResponse(
            UUID id,
            UUID hostId,
            String title,
            String description,
            String category,
            double latitude,
            double longitude,
            String locationLabel,
            Instant startsAt,
            String visibility,
            String status,
            Instant createdAt) {

        static EventResponse from(Event event) {
            return new EventResponse(
                    event.getId(),
                    event.getHostId(),
                    event.getTitle(),
                    event.getDescription(),
                    event.getCategory(),
                    event.getLatitude(),
                    event.getLongitude(),
                    event.getLocationLabel(),
                    event.getStartsAt(),
                    event.getVisibility(),
                    event.getStatus(),
                    event.getCreatedAt());
        }
    }
}
