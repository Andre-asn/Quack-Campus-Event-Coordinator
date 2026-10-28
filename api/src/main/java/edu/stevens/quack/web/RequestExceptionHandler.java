package edu.stevens.quack.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import edu.stevens.quack.event.InvalidEventException;
import edu.stevens.quack.event.MapQueryException;

@RestControllerAdvice
public class RequestExceptionHandler {

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> malformed() {
        ProblemDetail problem = ApiProblems.of(
                HttpStatus.BAD_REQUEST,
                "MALFORMED_REQUEST",
                "Malformed request",
                "The request body is not valid JSON for this endpoint.");
        return ResponseEntity.status(problem.getStatus())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    @ExceptionHandler(InvalidEventException.class)
    ResponseEntity<ProblemDetail> invalidEvent(InvalidEventException ex) {
        ProblemDetail problem = ApiProblems.of(
                HttpStatus.UNPROCESSABLE_CONTENT, "INVALID_EVENT", "Invalid event", ex.getMessage());
        problem.setProperty("errors", ex.errors());
        return ResponseEntity.status(problem.getStatus())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }

    @ExceptionHandler(MapQueryException.class)
    ResponseEntity<ProblemDetail> mapQuery(MapQueryException ex) {
        HttpStatus status = ex.status();
        String title = status == HttpStatus.BAD_REQUEST ? "Malformed request" : "Invalid map query";
        ProblemDetail problem = ApiProblems.of(status, ex.code(), title, ex.getMessage());
        return ResponseEntity.status(problem.getStatus())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }
}
