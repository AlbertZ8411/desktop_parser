/**
 * DocAnalyzer - A service for analyzing documents using LLM capabilities
 */
class DocAnalyzer {
    /**
     * Creates a new DocAnalyzer instance
     * @param {Object} llmService - The LLM service to use for analysis
     * @param {Object} options - Configuration options
     */
    constructor(llmService, options = {}) {
        this.llmService = llmService;
        this.options = {
            maxChunkSize: 4000,
            overlapSize: 200,
            ...options
        };
    }

    /**
     * Analyzes a document and extracts key information
     * @param {string} document - The document text to analyze
     * @param {Object} analysisOptions - Options for this specific analysis
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeDocument(document, analysisOptions = {}) {
        try {
            // Split document into manageable chunks if needed
            const chunks = this._splitIntoChunks(document);

            // Analyze each chunk
            const chunkResults = await Promise.all(
                chunks.map(chunk => this._analyzeChunk(chunk, analysisOptions))
            );

            // Combine and synthesize results
            const combinedResults = this._combineResults(chunkResults);

            return {
                success: true,
                data: combinedResults,
                meta: {
                    chunkCount: chunks.length,
                    documentLength: document.length
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    /**
     * Extracts specific entities from a document
     * @param {string} document - The document text
     * @param {Array<string>} entityTypes - Types of entities to extract
     * @returns {Promise<Object>} Extracted entities
     */
    async extractEntities(document, entityTypes = ['person', 'organization', 'location']) {
        try {
            const systemPrompt = `You are an expert entity extraction system. Extract all ${entityTypes.join(', ')} entities from the text.`;
            const userPrompt = `Extract all entities of these types: ${entityTypes.join(', ')}. Format your response as a JSON object with entity types as keys and arrays of unique entities as values. Text: ${document.substring(0, 8000)}`;

            const result = await this.llmService.query(
                systemPrompt,
                userPrompt,
                { responseFormat: { type: 'json_object' } }
            );

            if (!result.success) {
                throw new Error('Entity extraction failed: ' + (result.error || 'Unknown error'));
            }

            return {
                success: true,
                entities: result.data,
                meta: {
                    entityTypes,
                    documentLength: document.length
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                entities: null
            };
        }
    }

    /**
     * Summarizes a document
     * @param {string} document - The document to summarize
     * @param {Object} options - Summarization options
     * @returns {Promise<Object>} The summary
     */
    async summarizeDocument(document, options = {}) {
        const { maxLength = 500, format = 'paragraph' } = options;

        try {
            const systemPrompt = 'You are an expert document summarizer.';
            const userPrompt = `Summarize the following document in ${format} format. The summary should be no longer than ${maxLength} characters:\n\n${document.substring(0, 8000)}`;

            const result = await this.llmService.query(systemPrompt, userPrompt);

            if (!result.success) {
                throw new Error('Summarization failed: ' + (result.error || 'Unknown error'));
            }

            return {
                success: true,
                summary: result.data,
                meta: {
                    originalLength: document.length,
                    summaryLength: result.data.length,
                    compressionRatio: document.length > 0 ? result.data.length / document.length : 0
                }
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                summary: null
            };
        }
    }

    /**
     * Splits document into manageable chunks
     * @private
     * @param {string} document - The document to split
     * @returns {Array<string>} Document chunks
     */
    _splitIntoChunks(document) {
        const { maxChunkSize, overlapSize } = this.options;
        const chunks = [];

        if (document.length <= maxChunkSize) {
            return [document];
        }

        let position = 0;
        while (position < document.length) {
            const end = Math.min(position + maxChunkSize, document.length);
            chunks.push(document.substring(position, end));
            position = end - overlapSize;

            // Avoid infinite loop if overlapSize >= maxChunkSize
            if (position <= 0 || maxChunkSize <= overlapSize) {
                break;
            }
        }

        return chunks;
    }

    /**
     * Analyzes a single document chunk
     * @private
     * @param {string} chunk - Document chunk
     * @param {Object} options - Analysis options
     * @returns {Promise<Object>} Chunk analysis results
     */
    async _analyzeChunk(chunk, options) {
        const systemPrompt = 'You are an expert document analyst.';
        const userPrompt = `Analyze this document excerpt and extract key information including: main topics, key facts, and important entities.\n\n${chunk}`;

        const result = await this.llmService.query(systemPrompt, userPrompt);

        if (!result.success) {
            throw new Error('Chunk analysis failed: ' + (result.error || 'Unknown error'));
        }

        return {
            content: result.data,
            chunkSize: chunk.length
        };
    }

    /**
     * Combines results from multiple chunks
     * @private
     * @param {Array<Object>} chunkResults - Results from individual chunks
     * @returns {Object} Combined analysis
     */
    _combineResults(chunkResults) {
        // For more complex scenarios, we might send the individual results
        // back to the LLM for synthesis

        if (chunkResults.length === 1) {
            return chunkResults[0].content;
        }

        // Basic combination logic
        const combinedContent = chunkResults.map(r => r.content).join('\n\n');

        // For advanced implementation, you would use the LLM to synthesize
        // the results into a coherent whole
        return combinedContent;
    }
}

module.exports = DocAnalyzer;
