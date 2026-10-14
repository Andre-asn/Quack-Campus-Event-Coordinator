package edu.stevens.quack.user;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByProviderAndProviderSubjectId(String provider, String providerSubjectId);

    Optional<User> findByEmailIgnoreCase(String email);
}
