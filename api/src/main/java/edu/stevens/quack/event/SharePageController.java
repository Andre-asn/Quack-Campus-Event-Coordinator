package edu.stevens.quack.event;

import java.util.UUID;

import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

// The page itself never receives the share token. It stays in the URL fragment, which the browser
// does not send, so the token cannot show up in a log line here.
@RestController
class SharePageController {

    @GetMapping(value = "/share/events/{id}", produces = MediaType.TEXT_HTML_VALUE)
    String page(@PathVariable String id) {
        String eventId = canonical(id);
        String idLiteral = eventId == null ? "null" : "\"" + eventId + "\"";
        return """
                <!DOCTYPE html>
                <html lang="en">
                <head>
                  <meta charset="utf-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1">
                  <title>Quack!</title>
                </head>
                <body>
                  <p>Open Quack to see this event. If Quack does not open, it isn't installed on this device.</p>
                  <p><a id="open">Open Quack</a></p>
                  <script>
                    var id = %s;
                    var token = new URLSearchParams(location.hash.replace(/^#/, '')).get('token');
                    var open = document.getElementById('open');
                    if (!id || !token) {
                      open.remove();
                    } else {
                      open.href = 'quack://events/' + encodeURIComponent(id) + '?token=' + encodeURIComponent(token);
                    }
                  </script>
                </body>
                </html>
                """.formatted(idLiteral);
    }

    private static String canonical(String text) {
        if (text == null) {
            return null;
        }
        try {
            UUID parsed = UUID.fromString(text);
            return parsed.toString().equalsIgnoreCase(text) ? parsed.toString() : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }
}
