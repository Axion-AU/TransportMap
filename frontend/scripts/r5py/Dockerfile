# Runs r5py (https://r5py.readthedocs.io/) for the Stage 2 methodology-refactor
# PT travel-time matrix (docs/methodology_refactor.md item 2 & 7). r5py wraps
# Conveyal's R5 (Java) journey planner; no local Java is required on the host
# because everything runs inside this container -- see compute_pt_matrix.py.
#
# Built and run by frontend/scripts/compute-travel-time-matrix.mjs, not
# started standalone. Not part of the Vite/Node build -- this is offline,
# one-off matrix precomputation, same category of tool as fetch-*.mjs
# scripts, just needing a JVM so it can't be plain Node.
# R5's bundled jar requires Java 21 (class file version 65) -- eclipse-temurin
# ships a known-good JDK 21, unlike Debian bookworm's default openjdk-17 package.
FROM eclipse-temurin:21-jdk-jammy

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.11 \
    python3-pip \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir r5py

WORKDIR /work
COPY compute_pt_matrix.py /work/compute_pt_matrix.py

ENTRYPOINT ["python3", "/work/compute_pt_matrix.py"]
