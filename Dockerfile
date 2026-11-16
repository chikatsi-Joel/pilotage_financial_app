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
# Dépendances d'abord (couche en cache tant que pyproject.toml ne change pas) : modifier le code
# ne réinstalle plus numpy, scipy, statsmodels… (plusieurs minutes sur une petite VM).
COPY pyproject.toml README.md ./
RUN pip install --no-cache-dir --upgrade pip \
 && python -c "import tomllib; print(chr(10).join(tomllib.load(open('pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
 && pip install --no-cache-dir -r /tmp/requirements.txt
COPY app ./app
COPY migrations ./migrations
COPY alembic.ini ./
COPY static ./static
COPY --from=backoffice /out ./static/admin
RUN pip install --no-cache-dir --no-deps .
EXPOSE 8000
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
