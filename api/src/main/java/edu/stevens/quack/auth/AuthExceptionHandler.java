package edu.stevens.quack.auth;

import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import edu.stevens.quack.web.ApiProblems;

@RestControllerAdvice
public class AuthExceptionHandler {

    @ExceptionHandler(InvalidHandoffException.class)
    ResponseEntity<ProblemDetail> invalidHandoff() {
        return problem(ApiProblems.of(
                HttpStatus.UNAUTHORIZED,
                "INVALID_HANDOFF",
                "Invalid handoff",
                "The sign-in handoff is invalid or has expired."));
    }

    @ExceptionHandler(InvalidAppRedirectException.class)
    ResponseEntity<ProblemDetail> invalidAppRedirect() {
        return problem(ApiProblems.of(
                HttpStatus.BAD_REQUEST,
                "INVALID_APP_REDIRECT",
                "Invalid app redirect",
                "appRedirect must be the Quack sign-in return URL."));
    }

    @ExceptionHandler(UnauthenticatedException.class)
    ResponseEntity<ProblemDetail> unauthenticated() {
        return problem(ApiProblems.of(
                HttpStatus.UNAUTHORIZED,
                "UNAUTHENTICATED",
                "Unauthenticated",
                "Sign in to continue."));
    }

    private static ResponseEntity<ProblemDetail> problem(ProblemDetail problem) {
        return ResponseEntity.status(problem.getStatus())
                .contentType(MediaType.APPLICATION_PROBLEM_JSON)
                .body(problem);
    }
}
