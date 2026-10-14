# Built by Railway on each deploy. See .github/workflows/deploy.yml.

FROM eclipse-temurin:25-jdk AS build
WORKDIR /app

# Wrapper and build files first, so the dependency download is cached between builds.
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null

COPY src src
RUN ./gradlew --no-daemon bootJar

FROM eclipse-temurin:25-jre
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar

# Datasource and PORT come from Railway service variables. Flyway migrates on startup.
EXPOSE 8080
ENTRYPOINT ["java", "-Xmx384m", "-jar", "app.jar"]
