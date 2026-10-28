package edu.stevens.quack.event;

import java.util.List;
import java.util.stream.Collectors;

public class InvalidEventException extends RuntimeException {

    private final List<InvalidField> errors;

    public InvalidEventException(List<InvalidField> errors) {
        // The field details joined, so a client that shows only detail still says what to fix.
        super(errors.stream().map(InvalidField::detail).collect(Collectors.joining(" ")));
        this.errors = List.copyOf(errors);
    }

    public List<InvalidField> errors() {
        return errors;
    }

    // field uses the request's JSON names so the client can show each error under its input.
    public record InvalidField(String field, String code, String detail) {
    }
}
