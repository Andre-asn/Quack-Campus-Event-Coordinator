package edu.stevens.quack.event;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/events/{id}/reminder")
public class ReminderController {

    private final ReminderService reminders;

    public ReminderController(ReminderService reminders) {
        this.reminders = reminders;
    }

    @GetMapping
    public ReminderService.ReminderChoice read(
            @PathVariable String id, @RequestParam(required = false) String token) {
        return reminders.read(id, token);
    }

    @PutMapping
    public ReminderService.ReminderChoice save(
            @PathVariable String id,
            @RequestParam(required = false) String token,
            @RequestBody ChoiceRequest request) {
        return reminders.save(id, token, request == null ? null : request.leadMinutes());
    }

    @DeleteMapping
    public ResponseEntity<Void> delete(
            @PathVariable String id, @RequestParam(required = false) String token) {
        reminders.delete(id, token);
        return ResponseEntity.noContent().build();
    }

    public record ChoiceRequest(Integer leadMinutes) {
    }
}
