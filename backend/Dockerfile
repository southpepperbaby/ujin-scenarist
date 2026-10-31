FROM python:3.12-slim

ENV UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH=/opt/venv/bin:$PATH \
    PYTHONUNBUFFERED=1 \
    DATA_DIR=/data \
    UJIN_SECRETS=/run/secrets/ujin.json

RUN pip install --no-cache-dir uv
WORKDIR /app

# Зависимости отдельным слоем: пересобираются только при смене lock-файла.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project

COPY app ./app
COPY emulators ./emulators

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
