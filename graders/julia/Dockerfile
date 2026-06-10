FROM julia:1.11-bookworm

ARG DEBIAN_FRONTEND=noninteractive

ENV JULIA_DEPOT_PATH=/julia-depot
ENV JULIA_PKG_PRECOMPILE_AUTO=1
ENV LANG=C.UTF-8

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash coreutils git jq util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /julia-depot \
    && julia --startup-file=no --history-file=no -e 'using Pkg; Pkg.add("JSON3"); using JSON3' \
    && chmod -R a+rX /julia-depot

RUN useradd -m -u 1001 ag
RUN chown -R ag:ag /julia-depot

WORKDIR /julia_autograder
COPY julia_autograder /julia_autograder
COPY autograder.sh /bin/autograder.sh

RUN chmod 700 /bin/autograder.sh

ENTRYPOINT ["/bin/autograder.sh"]
