FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1

COPY payment/pyproject.toml payment/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

COPY payment/src ./src
RUN mkdir -p /app/payment/data

ENV PORT=3004
EXPOSE 3004
CMD ["uv", "run", "--no-sync", "uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "3004"]