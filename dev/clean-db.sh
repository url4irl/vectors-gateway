#!/bin/bash
# Stop any running containers with their networks
docker compose -f ./dev/docker-compose.yml down --volumes --remove-orphans

# Remove the volumes explicitly
docker volume rm vectors_gateway_db_postgres_data || true
docker volume rm qdrant_storage || true

# Force remove any dangling volumes
docker volume prune -f

# Remove the containers to be sure
docker rm -f vectors_gateway_db || true
docker rm -f vectors_gateway_qdrant || true

# Verify cleanup
echo "Checking for remaining volumes..."
docker volume ls | grep -E 'vectors_gateway_db_postgres_data|qdrant_storage' || echo "Volumes successfully removed"

echo "Checking for remaining containers..."
docker ps -a | grep -E 'vectors_gateway_db|vectors_gateway_qdrant' || echo "Containers successfully removed"