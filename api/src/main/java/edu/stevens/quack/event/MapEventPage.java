package edu.stevens.quack.event;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record MapEventPage(List<MapPin> events, String nextCursor) {

    public record MapPin(
            UUID id,
            String title,
            String category,
            double latitude,
            double longitude,
            Instant startsAt,
            MapHost host) {
    }

    public record MapHost(String displayName, String avatarUrl) {
    }
}
