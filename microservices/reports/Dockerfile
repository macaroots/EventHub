FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY reports/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY reports/app ./app

RUN mkdir -p /app/data \
    && useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

ENV PORT=3006 \
    REPORTS_DATA_DIR=/app/data
EXPOSE 3006

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-3006}"]
