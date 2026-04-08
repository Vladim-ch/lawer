-- CreateTable
CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "filename" VARCHAR(500) NOT NULL,
    "file_path" VARCHAR(1000) NOT NULL,
    "title" VARCHAR(500),
    "content_text" TEXT NOT NULL,
    "page_count" INTEGER,
    "file_size" INTEGER,
    "indexed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "legal_documents_file_path_key" ON "legal_documents"("file_path");

-- CreateIndex
CREATE INDEX "legal_documents_filename_idx" ON "legal_documents"("filename");

-- Full-text search: add tsvector column with GIN index (Russian config)
ALTER TABLE "legal_documents" ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('russian', coalesce("title", '') || ' ' || "content_text")) STORED;

CREATE INDEX "legal_documents_search_idx" ON "legal_documents" USING GIN ("search_vector");
