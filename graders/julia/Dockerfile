FROM julia:1

RUN apt-get update && apt-get install -y uuid-runtime

COPY install.jl run.sh /

RUN useradd ag
ENV JULIA_DEPOT_PATH "/home/ag/.julia"
RUN mkdir -p ${JULIA_DEPOT_PATH}
RUN julia /install.jl
RUN chown -R ag ${JULIA_DEPOT_PATH}

RUN chmod +x /run.sh