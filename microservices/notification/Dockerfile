FROM python:3.13-slim
COPY --from=ghcr.io/astral-sh/uv:0.11.5 /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY src ./src
COPY dev ./dev
RUN useradd --uid 10002 --create-home notification && mkdir -p /app/data && chown -R notification:notification /app
USER notification
ENV NOTIFICATION_DB_PATH=/app/data/notifications.db
EXPOSE 3006
CMD ["uv", "run", "--no-sync", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3006"]
