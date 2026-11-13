# Backoffice (/admin) : compilé ici, copié dans l'image de l'API.
FROM node:22-alpine AS backoffice
WORKDIR /backoffice
COPY backoffice/package.json backoffice/package-lock.json ./
RUN npm ci
COPY backoffice ./
RUN npx tsc -b && npx vite build --outDir /out --emptyOutDir

FROM python:3.12-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY pyproject.toml README.md ./
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
COPY static ./static
COPY --from=backoffice /out ./static/admin
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir .
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
