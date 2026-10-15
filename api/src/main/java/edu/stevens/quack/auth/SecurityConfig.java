package edu.stevens.quack.auth;

import org.springframework.http.HttpMethod;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.web.DefaultOAuth2AuthorizationRequestResolver;
import org.springframework.security.oauth2.client.web.OAuth2AuthorizationRequestResolver;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain securityFilterChain(
            HttpSecurity http,
            ClientRegistrationRepository clientRegistrations,
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
                .authorizationEndpoint(endpoint -> endpoint.authorizationRequestResolver(
                        authorizationRequestResolver(clientRegistrations)))
                .userInfoEndpoint(userInfo -> userInfo.oidcUserService(oidcUserService))
                .redirectionEndpoint(endpoint -> endpoint.baseUri("/api/v1/auth/callback"))
                .successHandler(successHandler)
                .failureHandler(failureHandler));
        return http.build();
    }

    private static OAuth2AuthorizationRequestResolver authorizationRequestResolver(
            ClientRegistrationRepository clientRegistrations) {
        DefaultOAuth2AuthorizationRequestResolver resolver = new DefaultOAuth2AuthorizationRequestResolver(
                clientRegistrations, "/oauth2/authorization");
        // Chrome keeps the last Google account. Ask every time so a signed-out user can pick another one.
        resolver.setAuthorizationRequestCustomizer(builder -> builder.additionalParameters(
                params -> params.put("prompt", "select_account")));
        return resolver;
    }
}
