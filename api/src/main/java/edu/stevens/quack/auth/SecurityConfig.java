package edu.stevens.quack.auth;

import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            GoogleOidcUserService oidcUserService,
            SignInSuccessHandler successHandler,
            SignInFailureHandler failureHandler,
            ProblemAuthenticationEntryPoint entryPoint) throws Exception {
        // The client is a native app. State-changing requests are not browser form posts,
        // and the session cookie is SameSite=Lax.
        http.csrf(csrf -> csrf.disable());
        http.httpBasic(basic -> basic.disable());
        http.formLogin(form -> form.disable());
        http.logout(logout -> logout.disable());
        http.exceptionHandling(handler -> handler.authenticationEntryPoint(entryPoint));
        http.authorizeHttpRequests(auth -> auth
                .requestMatchers(HttpMethod.GET, "/api/v1/health", "/api/v1/auth/login", "/api/v1/auth/callback")
                .permitAll()
                .requestMatchers(HttpMethod.POST, "/api/v1/auth/session").permitAll()
                .requestMatchers("/oauth2/authorization/**", "/error").permitAll()
                .anyRequest().authenticated());
        http.oauth2Login(oauth -> oauth
                .userInfoEndpoint(userInfo -> userInfo.oidcUserService(oidcUserService))
                .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/v1/auth/callback"))
                .successHandler(successHandler)
                .failureHandler(failureHandler));
        return http.build();
    }
}
