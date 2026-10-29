package edu.stevens.quack.event;

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

    public AttendanceService(
            EventRepository events,
            AttendanceRepository attendance,
            CurrentUser currentUser) {
        this.events = events;
        this.attendance = attendance;
        this.currentUser = currentUser;
    }

    @Transactional
    public void join(UUID eventId) {
        User user = currentUser.require();

        Event event = events.findById(eventId)
                .orElseThrow(() -> new AttendanceException(
                        HttpStatus.NOT_FOUND,
                        "EVENT_NOT_FOUND",
                        "The event does not exist."));

        if ("cancelled".equals(event.getStatus())) {
            throw new AttendanceException(
                    HttpStatus.CONFLICT,
                    "EVENT_CANCELLED",
                    "You cannot join a cancelled event.");
        }

        // Add the ended-event validation once the end-time rule is agreed.
        attendance.join(eventId, user.getId());
    }
}