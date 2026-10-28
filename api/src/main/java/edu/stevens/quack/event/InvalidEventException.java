package edu.stevens.quack.event;

import java.util.List;

public class InvalidEventException extends RuntimeException {

    private final List<InvalidField> errors;

    public InvalidEventException(List<InvalidField> errors) {
        super("One or more fields are invalid.");
        this.errors = List.copyOf(errors);
    }

    public List<InvalidField> errors() {
        return errors;
    }

    // field uses the request's JSON names so the client can show each error under its input.
    public record InvalidField(String field, String code, String detail) {
    }
}
