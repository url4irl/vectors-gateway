#!/bin/bash

set -e

SERVICE_NAME="vectors-gateway"
CONTAINER_NAME="vectors-gateway-test"
DB_COMPOSE_FILE="./dev/docker-compose.yml"
CLEAN_DB_SCRIPT="./dev/clean-db.sh"
API_PORT=4000
API_URL="http://localhost:${API_PORT}"

echo "--- Setting up test database ---"
./scripts/setup-test.sh

echo "--- Building Docker image for the service ---"
docker build -t ${SERVICE_NAME} .

echo "--- Running service Docker container ---"
# Remove any existing container with the same name
docker rm -f ${CONTAINER_NAME}
# Run the new container, linking it to the test database network
docker run -d -p ${API_PORT}:${API_PORT} --name ${CONTAINER_NAME} --network dev_default \
  -e DATABASE_URL="postgres://postgres:postgres@vectors_gateway_db:5432/postgres_test" \
  -e QDRANT_URL="http://vectors_gateway_qdrant:6333" \
  -e LITELLM_BASE_URL="${LITELLM_BASE_URL:-http://localhost:4000}" \
  -e LITELLM_API_KEY="${LITELLM_API_KEY:-test-key}" \
  ${SERVICE_NAME}

echo "--- Waiting for service to be ready ---"
# Wait for the service's health check endpoint to respond
until nc -z localhost ${API_PORT}; do
  echo "Waiting for service to start..."
  sleep 2
done

echo "--- Service is ready. Running API endpoint tests ---"

# --- API Endpoint Tests ---

echo "Testing GET / (Health Check)"
curl -s ${API_URL} | jq .

echo "Testing POST /v1/embeddings"
curl -s -X POST -H "Content-Type: application/json" -d '{
  "model": "text-embedding-ada-002",
  "input": "This is a test document for vectorization",
  "user": "testuser123"
}' ${API_URL}/v1/embeddings | jq .

echo "Testing POST /v1/retrieval/search"
curl -s -X POST -H "Content-Type: application/json" -H "x-user-id: testuser123" -d '{
  "query": "test search query",
  "userId": "testuser123",
  "knowledgeBaseId": 1,
  "limit": 5,
  "score_threshold": 0.7
}' ${API_URL}/v1/retrieval/search | jq .

echo "Testing GET /docs (Swagger Documentation)"
curl -s -I ${API_URL}/docs | head -1

echo "--- All API endpoint tests completed ---"

echo "--- Teardown: Stopping and removing service container ---"
docker stop ${CONTAINER_NAME}
docker rm ${CONTAINER_NAME}

echo "--- Teardown: Cleaning up test database data ---"
${CLEAN_DB_SCRIPT}

echo "--- Test script finished ---"
