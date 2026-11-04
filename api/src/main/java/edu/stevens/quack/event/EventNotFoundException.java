package edu.stevens.quack.event;

// Missing and not visible to this viewer look the same, so a link-only event's existence never leaks.
public class EventNotFoundException extends RuntimeException {

    public EventNotFoundException() {
        super("No event with that id.");
    }
}
