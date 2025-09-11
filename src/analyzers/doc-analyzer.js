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
     * Analyzes a document using LLM to extract structure, importance, and key insights
     * @param {Object|string} document - The document to analyze
     * @param {string} analysisType - Type of analysis to perform (outline, importance, comprehensive)
     * @param {Object} analysisOptions - Additional options for the analysis
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeDocument(document, analysisType = 'comprehensive', analysisOptions = {}) {
        try {
            console.log(`Starting ${analysisType} analysis...`);

            // Extract document content
            let content = this._extractContent(document);

            // Validate content
            if (!content || this._isBinaryContent(content)) {
                return {
                    success: false,
                    error: "Invalid or binary content detected",
                    data: null
                };
            }

            await this.testLLMResponse();

            // Clean the content
            content = this._cleanTextContent(content);
            console.log(`Document content length: ${content.length} characters`);

            // Split document into manageable chunks
            const chunks = this._splitIntoChunks(content);
            console.log(`Document split into ${chunks.length} chunks`);

            // Analyze each chunk
            const chunkResults = await Promise.all(
                chunks.map(chunk => this._analyzeChunkWithLLM(chunk, analysisType, analysisOptions))
            );

            console.log(`Completed analysis of ${chunkResults.length} chunks`);

            // For single-chunk documents, just return the result
            if (chunks.length === 1) {
                return {
                    success: true,
                    data: chunkResults[0],
                    meta: {
                        analysisType,
                        chunkCount: 1,
                        documentLength: content.length
                    }
                };
            }

            // For multi-chunk documents, synthesize results
            const combinedResults = await this._synthesizeResults(chunkResults, analysisType, content);

            return {
                success: true,
                data: combinedResults,
                meta: {
                    analysisType,
                    chunkCount: chunks.length,
                    documentLength: content.length,
                    documentName: document.fileName || 'unknown',
                    timestamp: new Date().toISOString()
                }
            };
        } catch (error) {
            console.error('Analysis error:', error);
            return {
                success: false,
                error: error.message,
                data: null
            };
        }
    }

    async _analyzeChunkWithLLM(chunk, analysisType, options = {}) {
        try {
            console.log(`Analyzing chunk (${chunk.length} chars) with type: ${analysisType}`);

            const { systemPrompt, userPrompt } = this._createPrompts(chunk, analysisType, options);

            // Log the prompts for debugging
            console.log("System prompt:", systemPrompt.substring(0, 100) + "...");

            // Get LLM response
            console.log("Sending request to LLM service...");
            const response = await this.llmService.query(systemPrompt, userPrompt, options);

            console.log("Received LLM response:", typeof response);
            console.log("Response length:", response ? response.length : 0);

            // Handle empty response
            if (!response || response.trim() === '') {
                console.error("⚠️ LLM returned empty response");
                return {
                    success: false,
                    error: "Empty response from LLM",
                    rawContent: ""
                };
            }

            // Log the first 100 chars of the response
            console.log("Response preview:", response.substring(0, 100) + "...");

            // Try to find and extract JSON from the response
            let jsonContent = this._extractJsonFromText(response);

            if (jsonContent) {
                try {
                    const parsedContent = JSON.parse(jsonContent);
                    console.log("Successfully parsed JSON response");
                    return {
                        success: true,
                        data: parsedContent,
                        rawContent: response
                    };
                } catch (jsonError) {
                    console.error("JSON parsing error:", jsonError);

                    // Try to fix common JSON issues
                    const fixedJson = this._attemptJsonFix(jsonContent);
                    if (fixedJson) {
                        console.log("Used fixed JSON");
                        return {
                            success: true,
                            data: fixedJson,
                            wasFixed: true,
                            rawContent: response
                        };
                    }
                }
            }

            // If we got here, JSON parsing failed
            console.error("Could not extract valid JSON from response");
            return {
                success: false,
                error: "JSON parsing failed",
                rawContent: response || ""
            };
        } catch (error) {
            console.error("Error in _analyzeChunkWithLLM:", error);
            return {
                success: false,
                error: error.message,
                rawContent: ""
            };
        }
    }

    /**
     * Extracts JSON from text that might contain other content
     */
    _extractJsonFromText(text) {
        if (!text) return null;

        // Try to find JSON object in the text
        const jsonStartIndex = text.indexOf('{');
        const jsonEndIndex = text.lastIndexOf('}');

        if (jsonStartIndex >= 0 && jsonEndIndex > jsonStartIndex) {
            return text.substring(jsonStartIndex, jsonEndIndex + 1);
        }

        return null;
    }

    /**
     * Attempts to fix common JSON formatting issues
     */
    _attemptJsonFix(jsonStr) {
        if (!jsonStr) return null;

        try {
            // Remove markdown code blocks
            let cleaned = jsonStr.replace(/```json|```/g, '').trim();

            // Fix unescaped quotes
            cleaned = cleaned.replace(/(?<!\\)"/g, '\\"');
            cleaned = cleaned.replace(/\\\\"/g, '\\"'); // Fix double escaping

            // Replace single quotes with double quotes for JSON compatibility
            cleaned = cleaned.replace(/'/g, '"');

            // Try parsing
            try {
                return JSON.parse(cleaned);
            } catch (e) {
                // More aggressive cleaning
                const objectMatches = cleaned.match(/{[^]*}/);
                if (objectMatches && objectMatches[0]) {
                    return JSON.parse(objectMatches[0]);
                }
            }

            return null;
        } catch (e) {
            console.error("JSON fix attempt failed:", e);
            return null;
        }
    }

    _createPrompts(chunk, analysisType, options = {}) {
        // Extremely simple prompt for testing
        const systemPrompt = `You are a document analyzer. Extract key information from the text and return ONLY a JSON object with this exact structure:

{
  "title": "Document title",
  "summary": "Brief summary",
  "keyPoints": ["point 1", "point 2"]
}

IMPORTANT: Your entire response must be ONLY the JSON. No explanations, no markdown, no additional text.`;

        const userPrompt = `Analyze this text: ${chunk}`;
        return { systemPrompt, userPrompt };
    }

    /**
     * Synthesizes results from multiple chunks into a coherent whole
     * @private
     */
    async _synthesizeResults(chunkResults, analysisType, originalContent) {
        const validResults = chunkResults.filter(result => !result.error);

        if (validResults.length === 0) {
            return {
                error: "No valid analysis results to synthesize",
                message: "All chunks failed analysis"
            };
        }

        // Create a summary of the original content for context
        const contentSummary = originalContent.substring(0, 500) +
            (originalContent.length > 500 ? "..." : "");

        // Create system prompt for synthesis
        const systemPrompt = "You are an expert at synthesizing multiple document analyses into a coherent and comprehensive assessment. Combine the separate analyses into a unified view that captures the essence of the entire document.";

        // Create user prompt with the results to synthesize
        const userPrompt = `I've analyzed a document in ${validResults.length} parts and need you to synthesize these analyses into a single coherent assessment.

Document preview:
${contentSummary}

Analysis type: ${analysisType}

Individual analysis results:
${JSON.stringify(validResults, null, 2)}

Please synthesize these results into a unified analysis that:
1. Maintains the same JSON structure as the individual analyses
2. Eliminates duplication
3. Resolves any contradictions
4. Preserves the most important insights
5. Creates a coherent outline of the entire document
6. Provides an overall evaluation of the document's structure, content, and importance

Your response should be a single JSON object that follows the same structure as the individual analyses but represents the entire document.`;

        try {
            // Query the LLM for synthesis
            const synthesisResponse = await this.llmService.query(
                systemPrompt,
                userPrompt,
                {
                    temperature: 0.3,
                    maxTokens: 2500,
                    responseFormat: { type: "json_object" }
                }
            );

            // Parse the response if needed
            if (typeof synthesisResponse === 'object') {
                return synthesisResponse;
            }

            try {
                return JSON.parse(synthesisResponse);
            } catch (e) {
                console.warn("Synthesis response is not valid JSON");
                return {
                    synthesisError: "Could not parse synthesis result",
                    rawSynthesis: synthesisResponse
                };
            }
        } catch (error) {
            console.error("Error synthesizing results:", error);

            // Fallback to basic combination if synthesis fails
            return this._basicCombineResults(validResults, analysisType);
        }
    }

    async testLLMResponse() {
        try {
            // Simple test prompt
            const testPrompt = `You are a test assistant. 
Return this exact JSON: {"test":"success","timestamp":"now"}`;

            console.log("Sending test prompt to LLM...");
            const response = await this.llmService.query(testPrompt, "Test request", {});

            console.log("Raw LLM response:", response);
            console.log("Response type:", typeof response);
            console.log("Response length:", response ? response.length : 0);

            if (!response || response.trim() === '') {
                console.error("⚠️ LLM returned empty response!");
                return false;
            }

            try {
                const json = JSON.parse(response);
                console.log("Successfully parsed JSON:", json);
                return true;
            } catch (e) {
                console.error("Failed to parse JSON:", e);
                return false;
            }
        } catch (error) {
            console.error("Test failed with error:", error);
            return false;
        }
    }

    /**
     * Basic fallback method to combine results if LLM synthesis fails
     * @private
     */
    _basicCombineResults(results, analysisType) {
        // Implementation depends on analysis type
        switch (analysisType) {
            case 'outline':
                return this._combineOutlineResults(results);
            case 'importance':
                return this._combineImportanceResults(results);
            case 'comprehensive':
            default:
                return this._combineComprehensiveResults(results);
        }
    }

    /**
     * Extracts content from the document object
     * @private
     */
    _extractContent(document) {
        if (!document) return '';

        if (typeof document === 'string') {
            return document;
        }

        if (document.content && typeof document.content === 'string') {
            return document.content;
        }

        if (document.text && typeof document.text === 'string') {
            return document.text;
        }

        if (document.data && typeof document.data === 'string') {
            return document.data;
        }

        // Fallback - try to stringify the object
        try {
            return JSON.stringify(document);
        } catch (e) {
            return '';
        }
    }

    /**
     * Checks if content appears to be binary or non-text
     * @private
     */
    _isBinaryContent(text) {
        if (!text || typeof text !== 'string') return true;

        // Quick check - if string has too many unusual characters, likely binary
        let nonPrintableCount = 0;
        let sampleSize = Math.min(text.length, 1000); // Check first 1000 chars

        for (let i = 0; i < sampleSize; i++) {
            const code = text.charCodeAt(i);
            // Check for non-printable characters
            if ((code < 32 && code !== 9 && code !== 10 && code !== 13) ||
                (code >= 127 && code <= 159)) {
                nonPrintableCount++;
            }
        }

        // If more than 10% non-printable, likely binary
        if (nonPrintableCount > sampleSize * 0.1) {
            return true;
        }

        // Check for common binary file signatures
        const binarySignatures = ['%PDF-', 'PK', 'ID3', 'GIF', 'PNG', 'JFIF', 'BM', 'MZ'];
        const start = text.substring(0, 20);

        return binarySignatures.some(sig => start.includes(sig));
    }

    /**
     * Cleans text content to remove binary or invalid characters
     * @private
     */
    _cleanTextContent(text) {
        if (!text || typeof text !== 'string') return '';

        return text
            // Remove control chars except newlines and tabs
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
            // Remove very long strings without spaces (likely encoded data)
            .replace(/[^\s]{100,}/g, '[BINARY DATA REMOVED]')
            // Limit repeated characters
            .replace(/(.)\1{20,}/g, '$1$1$1 [REPEATED CHARS REMOVED] ')
            // Clean up whitespace
            .replace(/\s{3,}/g, '\n\n');
    }

    /**
     * Splits document content into manageable chunks
     * @private
     */
    _splitIntoChunks(text) {
        if (!text) return [];

        const { maxChunkSize, overlapSize } = this.options;

        // For short texts, return as single chunk
        if (text.length <= maxChunkSize) {
            return [text];
        }

        const chunks = [];
        let startPos = 0;

        // Try to split on paragraph boundaries when possible
        while (startPos < text.length) {
            let endPos = startPos + maxChunkSize;

            // Don't exceed text length
            if (endPos >= text.length) {
                chunks.push(text.substring(startPos));
                break;
            }

            // Try to find paragraph break
            let splitPos = text.lastIndexOf('\n\n', endPos);

            // If no paragraph break, try sentence break
            if (splitPos <= startPos || splitPos < endPos - maxChunkSize/2) {
                splitPos = text.lastIndexOf('. ', endPos);
            }

            // If still no good break, just use maximum size
            if (splitPos <= startPos || splitPos < endPos - maxChunkSize/2) {
                splitPos = endPos;
            }

            // Add chunk
            chunks.push(text.substring(startPos, splitPos));

            // Move start position, accounting for overlap
            startPos = Math.max(startPos, splitPos - overlapSize);
        }

        return chunks;
    }

// Safe version of chunk splitting that handles non-string inputs
    _splitIntoChunks(text) {
        // Ensure text is a string
        if (typeof text !== 'string') {
            console.warn('Non-string provided to split into chunks, converting to string');
            text = String(text);
        }

        if (!text) {
            console.warn('Empty text provided to split into chunks');
            return [];
        }

        console.log(`Splitting text of length ${text.length}`);

        try {
            // Simple chunking by fixed size
            const chunkSize = 4000;
            const chunks = [];

            for (let i = 0; i < text.length; i += chunkSize) {
                chunks.push(text.slice(i, i + chunkSize));
            }

            console.log(`Split text into ${chunks.length} fixed-size chunks`);
            return chunks;
        } catch (error) {
            console.error('Error splitting text into chunks:', error);
            // Return whole text as a single chunk on error
            return [text];
        }
    }

// Safe version of chunk analysis that doesn't depend on unimplemented methods
    async _analyzeChunkSafe(chunk, analysisType, options) {
        if (!chunk) {
            console.warn('Empty chunk provided for analysis');
            return { empty: true };
        }

        // Ensure chunk is a string
        const chunkStr = typeof chunk === 'string' ? chunk : String(chunk);

        try {
            // Basic analysis that doesn't depend on external methods
            const words = chunkStr.split(/\s+/).filter(w => w.length > 0);
            const sentences = chunkStr.split(/[.!?]+/).filter(s => s.trim().length > 0);

            // Simple word frequency analysis
            const wordFreq = {};
            for (const word of words) {
                const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (cleanWord.length > 3) { // Ignore short words
                    wordFreq[cleanWord] = (wordFreq[cleanWord] || 0) + 1;
                }
            }

            // Get top words
            const topWords = Object.entries(wordFreq)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([word, count]) => ({ word, count }));

            return {
                chunkLength: chunkStr.length,
                wordCount: words.length,
                sentenceCount: sentences.length,
                topWords: topWords,
                excerpt: chunkStr.substring(0, 100) + (chunkStr.length > 100 ? '...' : '')
            };
        } catch (error) {
            console.error(`Chunk analysis error:`, error);
            // Return minimal result
            return {
                error: error.message,
                chunkLength: chunkStr.length,
                excerpt: chunkStr.substring(0, 100) + (chunkStr.length > 100 ? '...' : '')
            };
        }
    }

// Safe version of result combining that works with any input
    _combineResultsSafe(chunkResults, analysisType) {
        // Filter out any null results
        const validResults = (chunkResults || []).filter(result => result != null);

        if (validResults.length === 0) {
            console.warn('No valid chunk results to combine');
            return {
                message: "Analysis completed but no results were generated.",
                analysisType: analysisType
            };
        }

        // Create a simple combined analysis
        const combined = {
            analysisType: analysisType,
            totalChunks: validResults.length,
            totalWords: 0,
            totalSentences: 0,
            topWords: {},
            excerpts: []
        };

        // Combine all results
        validResults.forEach(result => {
            if (result.wordCount) combined.totalWords += result.wordCount;
            if (result.sentenceCount) combined.totalSentences += result.sentenceCount;

            // Collect excerpts
            if (result.excerpt) {
                combined.excerpts.push(result.excerpt);
            }

            // Combine word frequencies
            if (result.topWords) {
                result.topWords.forEach(({ word, count }) => {
                    combined.topWords[word] = (combined.topWords[word] || 0) + count;
                });
            }
        });

        // Convert combined top words to array
        combined.topWords = Object.entries(combined.topWords)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([word, count]) => ({ word, count }));

        // Limit excerpts
        combined.excerpts = combined.excerpts.slice(0, 5);

        return combined;
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



// Helper method to combine results from all chunks
    _combineResults(chunkResults, analysisType) {
        // Filter out any failed chunk results
        const validResults = chunkResults.filter(result => !result.error);

        if (validResults.length === 0) {
            console.warn('No valid chunk results to combine');
            return null;
        }

        // Implement your combination logic based on analysis type
        switch(analysisType) {
            case 'general':
                return this._combineGeneralResults(validResults);
            case 'entity':
                return this._combineEntityResults(validResults);
            case 'summary':
                return this._combineSummaryResults(validResults);
            default:
                return this._combineGeneralResults(validResults);
        }
    }

// Example of a combination method for general analysis
    _combineGeneralResults(results) {
        // Simple example - you would customize this based on your data structure
        const combined = {
            insights: [],
            topics: [],
            analysis: ''
        };

        // Combine all results
        results.forEach(result => {
            if (result.insights) {
                combined.insights = [...combined.insights, ...result.insights];
            }
            if (result.topics) {
                combined.topics = [...combined.topics, ...result.topics];
            }
            if (result.analysis) {
                combined.analysis += result.analysis + ' ';
            }
        });

        // Ensure we have some data
        if (combined.insights.length === 0 &&
            combined.topics.length === 0 &&
            combined.analysis === '') {
            return { message: "Analysis completed but no specific insights were identified." };
        }

        return combined;
    }
}

module.exports = DocAnalyzer;
