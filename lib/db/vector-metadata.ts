import { db } from "./db";
import { and, eq } from "drizzle-orm";
import {
  documentVectorMetadata,
  type DocumentVectorMetadata,
  type NewDocumentVectorMetadata,
} from "./schema";

/**
 * Create vector metadata for a document
 */
export async function createDocumentVectorMetadata(
  data: NewDocumentVectorMetadata
): Promise<DocumentVectorMetadata> {
  const [metadata] = await db
    .insert(documentVectorMetadata)
    .values(data)
    .returning();

  return metadata;
}

/**
 * Get vector metadata for a document
 */
export async function getDocumentVectorMetadata(
  documentId: number
): Promise<DocumentVectorMetadata | undefined> {
  const result = await db
    .select()
    .from(documentVectorMetadata)
    .where(eq(documentVectorMetadata.documentId, documentId))
    .limit(1);
  return result[0];
}

/**
 * Update vector metadata for a document
 */
export async function updateDocumentVectorMetadata(
  documentId: number,
  data: Partial<Omit<NewDocumentVectorMetadata, "id" | "documentId" | "knowledgeBaseId" | "userId" | "createdAt">>
): Promise<DocumentVectorMetadata | null> {
  const [metadata] = await db
    .update(documentVectorMetadata)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(documentVectorMetadata.documentId, documentId))
    .returning();

  return metadata;
}

/**
 * Mark document as vectorized
 */
export async function markDocumentAsVectorized(
  documentId: number,
  vectorCount: number
): Promise<DocumentVectorMetadata | null> {
  return updateDocumentVectorMetadata(documentId, {
    isVectorized: true,
    vectorCount,
    vectorizedAt: new Date(),
  });
}

/**
 * Mark document as not vectorized (for cleanup)
 */
export async function markDocumentAsNotVectorized(
  documentId: number
): Promise<DocumentVectorMetadata | null> {
  return updateDocumentVectorMetadata(documentId, {
    isVectorized: false,
    vectorCount: 0,
    vectorizedAt: null,
  });
}

/**
 * Get all vectorized documents for a knowledge base
 */
export async function getVectorizedDocumentsForKnowledgeBase(
  knowledgeBaseId: number
): Promise<DocumentVectorMetadata[]> {
  return db
    .select()
    .from(documentVectorMetadata)
    .where(
      and(
        eq(documentVectorMetadata.knowledgeBaseId, knowledgeBaseId),
        eq(documentVectorMetadata.isVectorized, true)
      )
    );
}

/**
 * Get all vectorized documents for a user
 */
export async function getVectorizedDocumentsForUser(
  userId: number
): Promise<DocumentVectorMetadata[]> {
  return db
    .select()
    .from(documentVectorMetadata)
    .where(
      and(
        eq(documentVectorMetadata.userId, userId),
        eq(documentVectorMetadata.isVectorized, true)
      )
    );
}

/**
 * Delete vector metadata for a document
 */
export async function deleteDocumentVectorMetadata(
  documentId: number
): Promise<boolean> {
  const result = await db
    .delete(documentVectorMetadata)
    .where(eq(documentVectorMetadata.documentId, documentId));

  return (result as any)?.rowCount ? (result as any).rowCount > 0 : false;
}

