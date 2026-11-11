package edu.stevens.quack.event;

public class EventCancellationException extends RuntimeException {

    public EventCancellationException() {
        super("Only the event host can cancel this event.");
    }
}
