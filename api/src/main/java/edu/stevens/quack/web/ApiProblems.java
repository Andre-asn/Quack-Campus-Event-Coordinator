package edu.stevens.quack.web;

import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;

import jakarta.servlet.http.HttpServletResponse;

public final class ApiProblems {

    private ApiProblems() {
    }

    public static ProblemDetail of(HttpStatus status, String code, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        problem.setType(URI.create("https://quack.example/problems/" + code.toLowerCase(Locale.ROOT).replace('_', '-')));
        problem.setProperty("code", code);
        return problem;
    }

    public static void write(HttpServletResponse response, ProblemDetail problem) throws IOException {
        response.setStatus(problem.getStatus());
        response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        String code = String.valueOf(problem.getProperties().get("code"));
        String json = "{"
                + "\"type\":" + quote(String.valueOf(problem.getType()))
                + ",\"title\":" + quote(problem.getTitle())
                + ",\"status\":" + problem.getStatus()
                + ",\"detail\":" + quote(problem.getDetail())
                + ",\"code\":" + quote(code)
                + "}";
        response.getWriter().write(json);
    }

    private static String quote(String value) {
        if (value == null) {
            return "null";
        }
        return "\"" + value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                + "\"";
    }
}
