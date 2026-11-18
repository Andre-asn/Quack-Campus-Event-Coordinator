package edu.stevens.quack.event;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events/{id}/announcements")
public class AnnouncementController {

    private final AnnouncementService announcements;

    public AnnouncementController(AnnouncementService announcements) {
        this.announcements = announcements;
    }

    @GetMapping
    public AnnouncementPage list(
            @PathVariable String id,
            @RequestParam(required = false) String token,
            @RequestParam(required = false) String limit,
            @RequestParam(required = false) String cursor) {
        return announcements.list(id, token, limit, cursor);
    }

    @PostMapping
    public ResponseEntity<Announcement> post(@PathVariable String id, @RequestBody PostRequest request) {
        return ResponseEntity.ok(announcements.post(id, request == null ? null : request.body()));
    }

    public record PostRequest(String body) {
    }

    public record Announcement(UUID id, String body, Instant createdAt) {
    }

    public record AnnouncementPage(List<Announcement> announcements, String nextCursor) {
    }
}
