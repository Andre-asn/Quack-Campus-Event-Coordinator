package edu.stevens.quack.event;

import java.time.Clock;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import edu.stevens.quack.auth.CurrentUser;
import edu.stevens.quack.user.User;

@Service
public class EventService {

    private final EventRepository events;
    private final CurrentUser currentUser;
    private final Clock clock;

    public EventService(EventRepository events, CurrentUser currentUser, Clock clock) {
        this.events = events;
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
}
