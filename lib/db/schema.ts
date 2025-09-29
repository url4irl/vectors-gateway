import {
  integer,
  pgTable,
  timestamp,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Vectors Gateway: document vectorization metadata
export const documentVectorMetadata = pgTable(
  "document_vector_metadata",
  {
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    documentId: integer().notNull(),
    knowledgeBaseId: integer().notNull(),
    userId: integer().notNull(),
    vectorCount: integer().notNull().default(0),
    isVectorized: boolean().notNull().default(false),
    vectorizedAt: timestamp(),
    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow().$onUpdateFn(() => sql`now()`),
  },
  (table) => ({
    uniqueDocumentPerKb: unique().on(table.documentId, table.knowledgeBaseId),
  })
);

export type DocumentVectorMetadata = typeof documentVectorMetadata.$inferSelect;
export type NewDocumentVectorMetadata = typeof documentVectorMetadata.$inferInsert;
