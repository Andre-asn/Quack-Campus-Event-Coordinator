package edu.stevens.quack.auth;

public class SignInRejectedException extends RuntimeException {

    private final SignInFailure failure;

    public SignInRejectedException(SignInFailure failure) {
        super(failure.name());
        this.failure = failure;
    }

    public SignInFailure failure() {
        return failure;
    }
}
