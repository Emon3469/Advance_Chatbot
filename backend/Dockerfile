# syntax=docker/dockerfile:1
#
# Production image for the Nexio AI backend (FastAPI + LangGraph).
# Deployed on Render as a Docker web service; see ../render.yaml.

FROM python:3.13.5-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    DATA_DIR=/app/data

WORKDIR /app

# Install dependencies in their own layer so they are cached while only the app
# code changes. Every pinned requirement ships manylinux wheels for 3.13, so no
# compiler toolchain is needed on the slim base image.
COPY requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Run as an unprivileged user and give it a writable DATA_DIR for the SQLite
# store and the document indexes.
RUN groupadd --gid 1000 appuser \
    && useradd --uid 1000 --gid 1000 --create-home --shell /usr/sbin/nologin appuser \
    && mkdir -p "$DATA_DIR" \
    && chown -R appuser:appuser /app "$DATA_DIR"

COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 8000

# Render injects PORT at runtime; the 8000 default keeps plain `docker run` and
# Compose usable without extra flags.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*' --timeout-keep-alive 75"]
