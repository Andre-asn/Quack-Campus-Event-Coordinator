package edu.stevens.quack.event;

import java.time.Instant;
import java.util.UUID;

// What the detail sheet shows. Attendee names are deliberately absent: only attendees may see them,
// through the attendee list.
public record EventDetail(
        UUID id,
        String title,
        String description,
        String category,
        String locationLabel,
        Instant startsAt,
        Instant endsAt,
        String status,
        Host host,
        long attendeeCount) {

    public record Host(String displayName, String avatarUrl) {
    }
}
