# syntax=docker/dockerfile:1

FROM maven:3.9-eclipse-temurin-17 AS build

WORKDIR /src
COPY QCan/pom.xml ./pom.xml
COPY QCan/src ./src
# The suite loads fixtures by relative path (Test.java: "testFiles/...") and
# swallows the IOException when they are absent, so a missing testFiles/ shows
# up as IndexOutOfBounds rather than a clear error. Build stage only.
COPY QCan/testFiles ./testFiles

# Two invocations, deliberately. pom.xml binds two install-file executions to
# the clean phase, installing the vendored blabel and nxparser jars from
# src/main/resources into the local repository; neither is on Maven Central.
# `mvn clean package` does NOT work: Maven resolves the dependency graph for
# the whole build plan up front, so package's resolution fails before clean
# ever runs. `mvn clean` must complete as its own invocation first.
# Tests run as part of package: pom.xml hard-codes surefire skipTests=false,
# which overrides -DskipTests anyway, and they validate the jar we ship.
RUN --mount=type=cache,target=/root/.m2 \
    mvn -B clean && mvn -B package

# Copied after the Maven build so editing the CLI does not invalidate it.
COPY cli/Canonicalise.java ./cli/Canonicalise.java
RUN javac -cp target/qcan-1.1-jar-with-dependencies.jar -d ./cli/classes ./cli/Canonicalise.java

FROM eclipse-temurin:17-jre

COPY --from=build /src/target/qcan-1.1-jar-with-dependencies.jar /opt/qcan/qcan.jar
COPY --from=build /src/cli/classes /opt/qcan/cli

# Relative paths resolve against a bind mount, for the fat jar's file modes.
WORKDIR /data

# The fat jar stays reachable for the other subcommands:
#   docker run --rm --entrypoint java qcan -jar /opt/qcan/qcan.jar easy -f ...
ENTRYPOINT ["java", "-cp", "/opt/qcan/qcan.jar:/opt/qcan/cli", "Canonicalise"]
