CREATE TABLE "document_vector_metadata" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "document_vector_metadata_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"documentId" integer NOT NULL,
	"knowledgeBaseId" integer NOT NULL,
	"userId" integer NOT NULL,
	"vectorCount" integer DEFAULT 0 NOT NULL,
	"isVectorized" boolean DEFAULT false NOT NULL,
	"vectorizedAt" timestamp,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_vector_metadata_documentId_knowledgeBaseId_unique" UNIQUE("documentId","knowledgeBaseId")
);
