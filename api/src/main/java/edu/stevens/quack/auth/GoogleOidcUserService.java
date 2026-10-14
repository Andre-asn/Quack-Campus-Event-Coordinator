package edu.stevens.quack.auth;

import org.springframework.security.oauth2.client.oidc.userinfo.OidcUserRequest;
import org.springframework.security.oauth2.client.userinfo.OAuth2UserService;
import org.springframework.security.oauth2.core.OAuth2AuthenticationException;
import org.springframework.security.oauth2.core.OAuth2Error;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.stereotype.Component;

import edu.stevens.quack.user.User;

@Component
public class GoogleOidcUserService implements OAuth2UserService<OidcUserRequest, OidcUser> {

    private final AuthService authService;

    public GoogleOidcUserService(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public OidcUser loadUser(OidcUserRequest userRequest) throws OAuth2AuthenticationException {
        try {
            User user = authService.signIn(GoogleIdentity.from(userRequest.getIdToken()));
            return new QuackOidcUser(userRequest.getIdToken(), user.getId());
        } catch (SignInRejectedException ex) {
            throw new OAuth2AuthenticationException(new OAuth2Error(ex.failure().name()), ex);
        }
    }
}
