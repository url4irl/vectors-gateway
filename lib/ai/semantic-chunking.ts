import * as math from "mathjs";
import natural from "natural";
import { LiteLLMClient } from "./sdk/litellm-client";

interface SentenceObject {
  sentence: string;
  index: number;
  combined_sentence?: string;
  combined_sentence_embedding?: number[];
  distance_to_next?: number;
}

export class SemanticChunkingService {
  private litellmClient: LiteLLMClient;

  constructor(litellmClient: LiteLLMClient) {
    this.litellmClient = litellmClient;
  }

  /**
   * Simple quantile calculation to avoid d3-array ES module issues
   */
  private quantile(sortedArray: number[], q: number): number {
    const index = (sortedArray.length - 1) * q;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index % 1;

    if (upper >= sortedArray.length) {
      return sortedArray[sortedArray.length - 1];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
  }

  /**
   * Splits text into sentences using a more robust approach
   */
  private splitToSentences(textCorpus: string): string[] {
    try {
      // Clean the text first
      const cleanedText = this.cleanText(textCorpus);

      // Try natural language processing first
      const tokenizer = new natural.SentenceTokenizerNew();
      const sentences = tokenizer.tokenize(cleanedText);

      // Filter out empty sentences and validate
      const validSentences = sentences
        .filter((sentence) => sentence && sentence.trim().length > 0)
        .map((sentence) => sentence.trim());

      if (validSentences.length > 0) {
        return validSentences;
      }

      // Fallback to simple regex-based splitting if NLP fails
      return this.fallbackSentenceSplitting(cleanedText);
    } catch (error) {
      console.warn(
        "NLP sentence tokenization failed, using fallback method:",
        error
      );
      return this.fallbackSentenceSplitting(this.cleanText(textCorpus));
    }
  }

  /**
   * Clean text to remove problematic characters and normalize
   */
  private cleanText(text: string): string {
    return text
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, "") // Remove control characters
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/[^\w\s.,!?;:()\-'"]/g, "") // Remove special characters that might cause issues
      .trim();
  }

  /**
   * Fallback sentence splitting using regex patterns
   */
  private fallbackSentenceSplitting(text: string): string[] {
    // Split on sentence endings, but be more careful about abbreviations
    const sentences = text
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .filter((sentence) => sentence && sentence.trim().length > 0)
      .map((sentence) => sentence.trim());

    return sentences.length > 0 ? sentences : [text];
  }

  /**
   * Structures sentences into SentenceObject array with combined sentences
   */
  private structureSentences(
    sentences: string[],
    bufferSize: number = 1
  ): SentenceObject[] {
    const sentenceObjectArray: SentenceObject[] = sentences.map(
      (sentence, i) => ({
        sentence,
        index: i,
      })
    );

    sentenceObjectArray.forEach((currentSentenceObject, i) => {
      let combinedSentence = "";

      // Add previous sentences within buffer
      for (let j = i - bufferSize; j < i; j++) {
        if (j >= 0) {
          combinedSentence += sentenceObjectArray[j].sentence + " ";
        }
      }

      // Add current sentence
      combinedSentence += currentSentenceObject.sentence + " ";

      // Add next sentences within buffer
      for (let j = i + 1; j <= i + bufferSize; j++) {
        if (j < sentenceObjectArray.length) {
          combinedSentence += sentenceObjectArray[j].sentence;
        }
      }

      sentenceObjectArray[i].combined_sentence = combinedSentence.trim();
    });

    return sentenceObjectArray;
  }

  /**
   * Generates embeddings for combined sentences using LiteLLM
   */
  private async generateAndAttachEmbeddings(
    sentencesArray: SentenceObject[]
  ): Promise<SentenceObject[]> {
    // Deep copy the sentencesArray to ensure purity
    const sentencesArrayCopy: SentenceObject[] = sentencesArray.map(
      (sentenceObject) => ({
        ...sentenceObject,
        combined_sentence_embedding: sentenceObject.combined_sentence_embedding
          ? [...sentenceObject.combined_sentence_embedding]
          : undefined,
      })
    );

    // Extract combined sentences for embedding
    const combinedSentencesStrings: string[] = sentencesArrayCopy
      .filter((item) => item.combined_sentence !== undefined)
      .map((item) => item.combined_sentence as string);

    // Generate embeddings using LiteLLM
    const embeddingsArray = await this.litellmClient.getEmbeddings(
      combinedSentencesStrings
    );

    // Attach embeddings to the corresponding SentenceObject
    let embeddingIndex = 0;
    for (let i = 0; i < sentencesArrayCopy.length; i++) {
      if (sentencesArrayCopy[i].combined_sentence !== undefined) {
        sentencesArrayCopy[i].combined_sentence_embedding =
          embeddingsArray[embeddingIndex++];
      }
    }

    return sentencesArrayCopy;
  }

  /**
   * Calculates cosine similarity between two vectors
   */
  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    const dotProduct = math.dot(vecA, vecB) as number;
    const normA = math.norm(vecA) as number;
    const normB = math.norm(vecB) as number;

    if (normA === 0 || normB === 0) {
      return 0;
    }

    const similarity = dotProduct / (normA * normB);
    return similarity;
  }

  /**
   * Calculates cosine distances and identifies significant semantic shifts
   */
  private calculateCosineDistancesAndSignificantShifts(
    sentenceObjectArray: SentenceObject[],
    percentileThreshold: number
  ): { updatedArray: SentenceObject[]; significantShiftIndices: number[] } {
    // Calculate cosine distances
    const distances: number[] = [];
    const updatedSentenceObjectArray = sentenceObjectArray.map(
      (item, index, array) => {
        if (
          index < array.length - 1 &&
          item.combined_sentence_embedding &&
          array[index + 1].combined_sentence_embedding
        ) {
          const embeddingCurrent = item.combined_sentence_embedding!;
          const embeddingNext = array[index + 1].combined_sentence_embedding!;
          const similarity = this.cosineSimilarity(
            embeddingCurrent,
            embeddingNext
          );
          const distance = 1 - similarity;
          distances.push(distance);
          return { ...item, distance_to_next: distance };
        } else {
          return { ...item, distance_to_next: undefined };
        }
      }
    );

    // Determine threshold for significant shifts
    const sortedDistances = [...distances].sort((a, b) => a - b);
    const quantileThreshold = percentileThreshold / 100;
    const breakpointDistanceThreshold = this.quantile(
      sortedDistances,
      quantileThreshold
    );

    if (breakpointDistanceThreshold === undefined) {
      throw new Error("Failed to calculate breakpoint distance threshold");
    }

    // Identify indices of significant shifts
    const significantShiftIndices = distances
      .map((distance, index) =>
        distance > breakpointDistanceThreshold ? index : -1
      )
      .filter((index) => index !== -1);

    return {
      updatedArray: updatedSentenceObjectArray,
      significantShiftIndices,
    };
  }

  /**
   * Groups sentences into semantic chunks based on shift indices
   */
  private groupSentencesIntoChunks(
    sentenceObjectArray: SentenceObject[],
    shiftIndices: number[]
  ): string[] {
    let startIdx = 0;
    const chunks: string[] = [];

    // Add one beyond the last index to handle remaining sentences
    const adjustedBreakpoints = [
      ...shiftIndices,
      sentenceObjectArray.length - 1,
    ];

    adjustedBreakpoints.forEach((breakpoint) => {
      const group = sentenceObjectArray.slice(startIdx, breakpoint + 1);
      const combinedText = group.map((item) => item.sentence).join(" ");
      chunks.push(combinedText);
      startIdx = breakpoint + 1;
    });

    return chunks;
  }

  /**
   * Main method to perform semantic chunking
   */
  async performSemanticChunking(
    content: string,
    bufferSize: number = 1,
    percentileThreshold: number = 90
  ): Promise<string[]> {
    try {
      console.log("Starting semantic chunking process...");

      // Validate input
      if (!content || content.trim().length === 0) {
        throw new Error("Content is empty or invalid");
      }

      // Step 1: Split text into sentences
      const sentences = this.splitToSentences(content);
      console.log(`Split into ${sentences.length} sentences`);

      if (sentences.length === 0) {
        throw new Error("No valid sentences found in content");
      }

      // If we have very few sentences, return them as individual chunks
      if (sentences.length <= 2) {
        console.log(
          "Too few sentences for semantic analysis, returning as individual chunks"
        );
        return sentences;
      }

      // Step 2: Structure sentences with combined context
      const structuredSentences = this.structureSentences(
        sentences,
        bufferSize
      );
      console.log(
        `Structured ${structuredSentences.length} sentences with context`
      );

      // Step 3: Generate embeddings for combined sentences
      console.log("Generating embeddings for semantic analysis...");
      const sentencesWithEmbeddings = await this.generateAndAttachEmbeddings(
        structuredSentences
      );

      // Step 4: Calculate distances and identify semantic shifts
      const { updatedArray, significantShiftIndices } =
        this.calculateCosineDistancesAndSignificantShifts(
          sentencesWithEmbeddings,
          percentileThreshold
        );

      console.log(
        `Found ${significantShiftIndices.length} significant semantic shifts`
      );

      // Step 5: Group sentences into semantic chunks
      const semanticChunks = this.groupSentencesIntoChunks(
        updatedArray,
        significantShiftIndices
      );

      console.log(`Created ${semanticChunks.length} semantic chunks`);
      return semanticChunks;
    } catch (error) {
      console.error("Error in semantic chunking:", error);

      // Fallback to simple chunking if semantic chunking fails
      console.log(
        "Falling back to simple chunking due to semantic chunking failure"
      );
      return this.fallbackToSimpleChunking(content);
    }
  }

  /**
   * Fallback to simple chunking when semantic chunking fails
   */
  private fallbackToSimpleChunking(content: string): string[] {
    const maxChunkSize = 2000; // Smaller chunks for fallback
    const chunks: string[] = [];

    // Split by sentences first
    const sentences = content
      .split(/[.!?]+/)
      .filter((s) => s.trim().length > 0);
    let currentChunk = "";

    for (const sentence of sentences) {
      const potentialChunk =
        currentChunk + (currentChunk ? " " : "") + sentence.trim();

      if (potentialChunk.length > maxChunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence.trim();
      } else {
        currentChunk = potentialChunk;
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    console.log(`Fallback created ${chunks.length} simple chunks`);
    return chunks;
  }
}
