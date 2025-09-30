# Vectors Gateway <!-- omit in toc -->

Embeddings and retrieval API that abstracts LiteLLM (embeddings) and Qdrant (vector search).

- [Architecture](#architecture)
  - [How It Works](#how-it-works)
- [Quick Start](#quick-start)
- [API](#api)
- [Environment Variables](#environment-variables)
- [Database Management](#database-management)
  - [Database Migration Lifecycle](#database-migration-lifecycle)
    - [Production Environment](#production-environment)
    - [Development Environment](#development-environment)
- [Deployment](#deployment)

## Architecture

```mermaid
graph TB
    %% External Services
    Client[Client Application]
    LiteLLM[LiteLLM Service]
    Qdrant[Qdrant Vector DB]
    PostgreSQL[(PostgreSQL)]
    
    %% Vectors Gateway Service
    subgraph "Vectors Gateway Service"
        API[Express API Server]
        Auth[API Key Authentication]
        
        subgraph "AI Layer"
            Embeddings[Embeddings Service]
            QdrantService[Qdrant Service]
            DocumentProcessor[Document Processor]
        end
        
        subgraph "Data Layer"
            Metadata[Vector Metadata]
        end
    end
    
    %% API Endpoints
    subgraph "API Endpoints"
        EmbeddingsAPI[POST /v1/embeddings]
        RetrievalAPI[POST /v1/retrieval/search]
        DocumentsAPI[DELETE /v1/documents/:id]
        HealthAPI[GET /]
    end
    
    %% Client Interactions
    Client -->|API Key + User ID| Auth
    Auth --> API
    
    %% API Routing
    API --> EmbeddingsAPI
    API --> RetrievalAPI
    API --> DocumentsAPI
    API --> HealthAPI
    
    %% Embeddings Flow (Direct API)
    EmbeddingsAPI --> Embeddings
    Embeddings --> LiteLLM
    LiteLLM -->|Vector Embeddings| Embeddings
    Embeddings -->|Response| Client
    
    %% Retrieval Flow (Direct API)
    RetrievalAPI --> Embeddings
    Embeddings --> LiteLLM
    LiteLLM -->|Query Vector| QdrantService
    QdrantService --> Qdrant
    Qdrant -->|Similar Vectors| QdrantService
    QdrantService -->|Results| Client
    
    %% Document Management Flow (Document Processor)
    DocumentsAPI --> DocumentProcessor
    DocumentProcessor --> QdrantService
    DocumentProcessor --> Metadata
    QdrantService --> Qdrant
    Metadata --> PostgreSQL
    
    %% Data Storage
    QdrantService -.->|Vector Storage| Qdrant
    Metadata -.->|Metadata Storage| PostgreSQL
    
    %% Styling
    classDef service fill:#e1f5fe,stroke:#01579b,stroke-width:2px
    classDef database fill:#f3e5f5,stroke:#4a148c,stroke-width:2px
    classDef api fill:#e8f5e8,stroke:#1b5e20,stroke-width:2px
    classDef external fill:#fff3e0,stroke:#e65100,stroke-width:2px
    
    class Embeddings,QdrantService,DocumentProcessor service
    class Qdrant,PostgreSQL,Metadata database
    class EmbeddingsAPI,RetrievalAPI,DocumentsAPI,HealthAPI api
    class Client,LiteLLM external
```

### How It Works

1. **Authentication**: All requests require an API key and user ID for security and data isolation
2. **Embeddings API**: Direct text-to-vector conversion using LiteLLM (no document storage)
3. **Retrieval API**: Direct semantic search using LiteLLM + Qdrant with flexible search scope:
   - **Knowledge Base Level**: Search across all documents in a knowledge base
   - **Document Level**: Search within a specific document (optional `documentId` parameter)
4. **Document Management**: Document Processor handles document deletion with proper cleanup:
   - **Deletion**: Removes documents and cleans up all associated data across Qdrant and PostgreSQL
5. **Storage**: Vectors are stored in Qdrant with metadata in PostgreSQL
6. **Data Integrity**: Document operations maintain consistency across both storage systems

## Quick Start

```bash
pnpm install
pnpm dev
# Service will run on http://localhost:4000
```

This starts the Express app and some Docker services (see `dev/docker-compose.yml`).

OpenAPI is served by `lib/docs.ts` from `openapi.json`. Update the JSON file when changing endpoints.

You'll need a running LiteLLM instance (with embeddings support), Qdrant and a Postgres database. The provided Docker Compose file for local development includes a PostgreSQL database and Qdrant instance.

## API

Swagger UI is available at `/docs` when service is running. OpenAPI spec: [`openapi.json`](./openapi.json).

## Environment Variables

- `PORT` (default: 4000)
- `API_KEY` (required) - API key for authentication
- `LITELLM_BASE_URL` (e.g., http://localhost:4000 for your LiteLLM proxy)
- `LITELLM_API_KEY` (you must generate an API key from your LiteLLM instance)
- `QDRANT_URL` (default: http://localhost:6333)
- `QDRANT_API_KEY` (optional)
- `QDRANT_COLLECTION_NAME` (default: documents)
- `DEFAULT_EMBEDDING_MODEL` (default: openai/bge-m3:latest)

## Database Management

### Database Migration Lifecycle

#### Production Environment

Database migrations are managed using Drizzle ORM. In a production environment, migrations must be applied **manually** by accessing the running container and executing the following command within it:

```bash
pnpm drizzle-kit migrate --config ./dist/drizzle.config.js
```

This command will apply any pending schema changes to the database. Ensure you run this command after any deployment that includes database schema modifications.

#### Development Environment

In development, create and apply migrations using:

```bash
pnpm run db:generate # Generates a new migration file
pnpm run db:migrate # Applies the migration to the database
```

## Deployment

When code changes are pushed to the repository, the container is rebuilt and the updated service is deployed.

Contributions are always welcome ❤️
