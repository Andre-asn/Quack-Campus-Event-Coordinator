package edu.stevens.quack.event;

import java.time.Instant;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

// What the detail sheet shows. Attendee names are deliberately absent: only attendees may see them,
// through the attendee list. The share token is present only for the host.
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
        long attendeeCount,
        String visibility,
        @JsonInclude(JsonInclude.Include.NON_NULL) UUID shareToken,
        boolean joined) {

    public record Host(String displayName, String avatarUrl) {
    }
}
