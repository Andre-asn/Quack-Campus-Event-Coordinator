package edu.stevens.quack.event;

import org.springframework.http.HttpStatus;

// A request that names an event the caller cannot change in its current state.
public class EventStateException extends RuntimeException {

    private final HttpStatus status;
    private final String code;

    public EventStateException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
