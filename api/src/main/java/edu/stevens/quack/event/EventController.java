package edu.stevens.quack.event;

import java.net.URI;
import java.time.Instant;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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
