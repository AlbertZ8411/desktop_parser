// src/services/LLMService.js
const { OpenAI } = require('openai');

/**
 * local llm service
 */
class LLMService {
    /**
     * construct and init service instance
     * @param {Object} options
     */
    constructor(options = {}) {
        this.client = new OpenAI({
            apiKey: options.apiKey,
            baseURL: options.baseUrl || 'http://localhost:11434/v1',
        });
        console.log(`apiKey:: ${options.apiKey}`)
        this.baseUrl = options.baseUrl;
        this.model = options.model || 'gpt-oss:20b';
        this.maxTokens = options.maxTokens || 4000;
        this.defaultTemperature = options.temperature || 0.3;
    }

    /**
     * query model
     * @param {string} systemPrompt
     * @param {string} userContent
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async query(systemPrompt, userPrompt, options = {}) {
        try {
            // Create messages array for OpenAI format
            const messages = [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ];

            console.log(`Sending query to LLM with ${messages.length} messages`);

            // Call the API
            const response = await this.client.chat.completions.create({
                model: this.model,
                messages: messages,
                temperature: options.temperature || this.defaultTemperature,
                max_tokens: options.maxTokens || this.maxTokens
            });

            // Log response info
            console.log(`Received response with ${response.choices?.length || 0} choices`);

            // Extract the content from the response
            const content = response.choices?.[0]?.message?.content || "";

            console.log(`Response content length: ${content.length}`);

            // Return just the content string
            return content;
        } catch (error) {
            console.error("LLM query error:", error);
            throw error;
        }
    }


    async checkAvailability() {
        try {
            const response = await fetch(`http://localhost:11434/api/version`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 5000 // 5 秒超时
            });

            return response.ok;
        } catch (error) {
            console.error('LLM service availability check failed:', error);
            return false;
        }
    }

    /**
     * process long text
     * @param {string} systemPrompt
     * @param {string} longText
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async processLongText(systemPrompt, longText, options = {}) {
        const {
            chunkSize = 10000,
            overlapSize = 500,
            chunkPrompt = null,
            mergePrompt = null
        } = options;

        try {
            if (longText.length <= chunkSize) {
                return await this.query(systemPrompt, longText, options);
            }

            const chunks = this._splitTextIntoChunks(longText, chunkSize, overlapSize);
            const chunkResults = [];

            for (let i = 0; i < chunks.length; i++) {

                const currentChunkPrompt = chunkPrompt ||
                    `${systemPrompt}\n\nNote: This is part ${i+1} of the full text, out of a total of ${chunks.length} parts.`;

                const result = await this.query(
                    currentChunkPrompt,
                    chunks[i],
                    {
                        ...options,
                        maxTokens: Math.min(2000, options.maxTokens || this.maxTokens)
                    }
                );

                if (result.success) {
                    chunkResults.push(result.data);
                } else {
                    chunkResults.push(`[Part ${i+1} processing failed: ${result.error}]`);
                }
            }

            if (chunks.length === 1) {
                return {
                    success: true,
                    data: chunkResults[0]
                };
            }

            // 合并结果
            const finalMergePrompt = mergePrompt ||
                `${systemPrompt}\n\nBelow are the analysis results for ${chunks.length} parts of the text; please merge them into a single complete response.`;

            return await this.query(
                finalMergePrompt,
                chunkResults.join("\n\n==== next part ====\n\n"),
                options
            );
        } catch (error) {
            return {
                success: false,
                error: `Process failed: ${error.message}`
            };
        }
    }

    /**
     * split text into chunks
     * @private
     */
    _splitTextIntoChunks(text, chunkSize, overlapSize = 0) {
        const chunks = [];
        let startIndex = 0;

        while (startIndex < text.length) {
            let endIndex = Math.min(startIndex + chunkSize, text.length);

            if (endIndex < text.length) {
                const paragraphEnd = text.lastIndexOf('\n\n', endIndex);
                if (paragraphEnd > startIndex) {
                    endIndex = paragraphEnd;
                } else {
                    const sentenceEnd = text.lastIndexOf('. ', endIndex);
                    if (sentenceEnd > startIndex) {
                        endIndex = sentenceEnd + 1;
                    }
                }
            }

            chunks.push(text.substring(startIndex, endIndex));

            startIndex = Math.max(startIndex, endIndex - overlapSize);
        }

        return chunks;
    }
}

module.exports = LLMService;
