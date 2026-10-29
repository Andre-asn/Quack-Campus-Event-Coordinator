package edu.stevens.quack.event;

import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import edu.stevens.quack.web.ApiProblems;

@RestControllerAdvice
public class AttendanceExceptionHandler {

    @ExceptionHandler(AttendanceException.class)
    public ResponseEntity<ProblemDetail> handle(AttendanceException ex) {
        ProblemDetail problem = ApiProblems.of(
                ex.status(),
                ex.code(),
                "Attendance request failed",
                ex.getMessage());

        return ResponseEntity.status(ex.status())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }
}