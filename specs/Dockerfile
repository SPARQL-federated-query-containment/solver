# syntax=docker/dockerfile:1

FROM debian:bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential flex bison \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
COPY SpeCS/src ./src
RUN cd src && make

FROM debian:bookworm-slim

# Pinned rather than apt-installed: the distro's z3 floats with the base image,
# which makes results non-reproducible across rebuilds.
ARG Z3_VERSION=4.13.4
ARG Z3_BUILD=x64-glibc-2.35

RUN apt-get update && apt-get install -y --no-install-recommends \
        ca-certificates curl unzip \
    && curl -fsSL -o /tmp/z3.zip \
        "https://github.com/Z3Prover/z3/releases/download/z3-${Z3_VERSION}/z3-${Z3_VERSION}-${Z3_BUILD}.zip" \
    && unzip -q /tmp/z3.zip -d /opt \
    && mv "/opt/z3-${Z3_VERSION}-${Z3_BUILD}" /opt/z3 \
    && ln -s /opt/z3/bin/z3 /usr/local/bin/z3 \
    && rm -rf /tmp/z3.zip /var/lib/apt/lists/*

COPY --from=build /src/src/specs /opt/specs/specs
COPY cli/entrypoint.sh /usr/local/bin/specs
RUN chmod +x /usr/local/bin/specs

# SpeCS writes <input>.smt beside its input, and formula.smt into the working
# directory in -superquery/-subquery mode, so the workdir must be writable.
WORKDIR /work

ENTRYPOINT ["/usr/local/bin/specs"]
