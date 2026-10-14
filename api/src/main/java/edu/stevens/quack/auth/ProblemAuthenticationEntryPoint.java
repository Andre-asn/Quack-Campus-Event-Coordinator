package edu.stevens.quack.auth;

import java.io.IOException;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.stereotype.Component;

import edu.stevens.quack.web.ApiProblems;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class ProblemAuthenticationEntryPoint implements AuthenticationEntryPoint {

    @Override
    public void commence(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException authException) throws IOException {
        ApiProblems.write(response, ApiProblems.of(
                HttpStatus.UNAUTHORIZED,
                "UNAUTHENTICATED",
                "Unauthenticated",
                "Sign in to continue."));
    }
}
