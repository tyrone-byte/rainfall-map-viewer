FROM node:22-bookworm-slim AS browser-libraries
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund

FROM python:3.12-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server.py rainfall.py water.py water_service.py ./
COPY public ./public
COPY data ./data
COPY --from=browser-libraries /build/node_modules/leaflet/dist ./node_modules/leaflet/dist
COPY --from=browser-libraries /build/node_modules/chart.js/dist ./node_modules/chart.js/dist
RUN useradd --create-home rainfall && chown -R rainfall:rainfall /app
USER rainfall
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["python", "server.py", "--host", "0.0.0.0"]
