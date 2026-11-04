package edu.stevens.quack.event;

import java.util.UUID;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events")
public class AttendanceController {

    private final AttendanceService attendance;

    public AttendanceController(AttendanceService attendance) {
        this.attendance = attendance;
    }

    @PutMapping("/{id}/attendance")
    public ResponseEntity<Void> join(
            @PathVariable("id") UUID eventId,
            @RequestBody(required = false) JoinRequest request) {
        attendance.join(eventId, request == null ? null : request.token());
        return ResponseEntity.ok().build();
    }

    public record JoinRequest(String token) {
    }
}