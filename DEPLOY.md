# Деплой Node.js API на Cloud Run + Cloud SQL (PostgreSQL)

## Как это устроено

```
Клиент → Cloud Run (контейнер с Express API)
                 │
                 │  Unix-сокет /cloudsql/PROJECT:REGION:INSTANCE
                 ▼
         Cloud SQL (PostgreSQL)
```

Cloud Run — serverless-контейнеры, масштабируются от нуля. Cloud SQL —
управляемая база данных. Соединяются они не по обычному TCP/IP,
а через **Cloud SQL Auth Proxy**, встроенный в Cloud Run: указываешь
флаг `--add-cloudsql-instances`, и в контейнере появляется unix-сокет
`/cloudsql/<CONNECTION_NAME>`, через который приложение подключается к базе
без публичного IP и без ручной настройки TLS.

Аутентификация в саму базу (Cloud SQL) идёт по логину/паролю Postgres,
но сам канал до инстанса — защищён IAM и Cloud SQL Auth Proxy.

---

## 0. Подготовка

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID

gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com
```

## 1. Создать Cloud SQL instance (PostgreSQL)

```bash
gcloud sql instances create my-api-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west1 \
  --storage-size=10GB \
  --storage-type=HDD

# Задать пароль пользователю postgres
gcloud sql users set-password postgres \
  --instance=my-api-db \
  --password=YOUR_STRONG_PASSWORD

# Создать саму базу данных
gcloud sql databases create tasksdb --instance=my-api-db
```

Узнать connection name (понадобится дальше):

```bash
gcloud sql instances describe my-api-db --format="value(connectionName)"
# вернёт что-то вроде: your-project:europe-west1:my-api-db
# clrun-node:europe-west1:my-api-db
```

Применить схему (можно через Cloud SQL Auth Proxy локально, либо через
Cloud Shell):

```bash
# Скачать и запустить Cloud SQL Auth Proxy локально (v2)
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
./cloud-sql-proxy YOUR_CONNECTION_NAME &

psql "host=127.0.0.1 port=5432 dbname=tasksdb user=postgres password=YOUR_STRONG_PASSWORD" -f schema.sql
```

## 2. Собрать и запушить образ

Проще всего через Cloud Build — не нужен локальный Docker:

```bash
gcloud artifacts repositories create api-repo \
  --repository-format=docker \
  --location=europe-west1

gcloud builds submit --tag europe-west1-docker.pkg.dev/YOUR_PROJECT_ID/api-repo/gcp-node-api
```

(Если Docker есть локально — можно `docker build` + `docker push` тем же тегом.)

## 3. Задеплоить на Cloud Run

Пароль лучше хранить в Secret Manager, а не как plain env var:

```bash
echo -n "YOUR_STRONG_PASSWORD" | gcloud secrets create db-password --data-file=-

gcloud run deploy gcp-node-api \
  --image=europe-west1-docker.pkg.dev/YOUR_PROJECT_ID/api-repo/gcp-node-api \
  --region=europe-west1 \
  --platform=managed \
  --allow-unauthenticated \
  --add-cloudsql-instances=YOUR_CONNECTION_NAME \
  --set-env-vars="DB_SOCKET_PATH=/cloudsql/YOUR_CONNECTION_NAME,DB_USER=postgres,DB_NAME=tasksdb" \
  --set-secrets="DB_PASSWORD=db-password:latest"
```

`--allow-unauthenticated` — для теста через браузер/curl. Для приватного
API это стоит убрать и настраивать IAM-доступ отдельно.

## 4. Проверить

```bash
SERVICE_URL=$(gcloud run services describe gcp-node-api --region=europe-west1 --format="value(status.url)")

curl "$SERVICE_URL/health"

curl -X POST "$SERVICE_URL/tasks" \
  -H "Content-Type: application/json" \
  -d '{"title": "Первая задача"}'

curl "$SERVICE_URL/tasks"
```

## Полезные заметки

- **Service Account**: у Cloud Run service account по умолчанию должна быть
  роль `roles/cloudsql.client`, иначе подключение к Cloud SQL упадёт.
  Обычно default compute SA уже её имеет, но если нет:
  ```bash
  gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
    --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
    --role="roles/cloudsql.client"
  ```
- **Холодный старт**: Cloud Run масштабируется до нуля по умолчанию — первый
  запрос после простоя будет медленнее. Для практики это нормально, для
  прода можно задать `--min-instances=1`.
- **Локальная разработка**: используй `DB_HOST=127.0.0.1` вместо
  `DB_SOCKET_PATH`, подключившись через `cloud-sql-proxy` (см. шаг 1), либо
  просто локальный Postgres в Docker.
- **Логи**: `gcloud run services logs read gcp-node-api --region=europe-west1`
