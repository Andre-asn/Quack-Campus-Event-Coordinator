package edu.stevens.quack.auth;

import java.util.UUID;

public record UserResponse(UUID id, String email, String displayName, String avatarUrl) {

    public static UserResponse from(edu.stevens.quack.user.User user) {
        return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getAvatarUrl());
    }
}
