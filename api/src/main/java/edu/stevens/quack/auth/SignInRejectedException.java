package edu.stevens.quack.auth;

public class SignInRejectedException extends RuntimeException {

    private final SignInFailure failure;
    private final String rejectedEmail;

    public SignInRejectedException(SignInFailure failure) {
        this(failure, null);
    }

    public SignInRejectedException(SignInFailure failure, String rejectedEmail) {
        super(failure.name());
        this.failure = failure;
        this.rejectedEmail = rejectedEmail;
    }

    public SignInFailure failure() {
        return failure;
    }

    /** The verified email that was turned away, so the app can tell the user which account it saw. */
    public String rejectedEmail() {
        return rejectedEmail;
    }
}
