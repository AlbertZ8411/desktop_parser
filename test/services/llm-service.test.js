// tests/services/LLMService.test.js
const LLMService = require('../../src/services/llm-service');
const { OpenAI } = require('openai');

// Mock OpenAI client
jest.mock('openai', () => {
    return {
        OpenAI: jest.fn().mockImplementation(() => {
            return {
                chat: {
                    completions: {
                        create: jest.fn()
                    }
                }
            };
        })
    };
});

describe('LLMService', () => {
    let llmService;
    let mockOpenAIInstance;

    // Setup before each test
    beforeEach(() => {
        // Clear all mocks
        jest.clearAllMocks();

        // Create a new service instance with default options
        llmService = new LLMService({
            apiKey: 'test-api-key',
            baseUrl: 'http://test-api.local/v1',
            model: 'test-model',
            maxTokens: 2000,
            temperature: 0.5
        });

        // Get reference to the mocked OpenAI instance
        mockOpenAIInstance = new OpenAI();
    });

    // Test service initialization
    describe('Initialization', () => {
        test('should initialize with default values when options are not provided', () => {
            const defaultService = new LLMService();

            // Verify OpenAI client was created with default values
            expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
                baseURL: 'http://localhost:11434/v1',
                timeout: 60000,
                maxRetries: 0
            }));

            // Verify default model properties
            expect(defaultService.model).toBe('gpt-oss:20b');
            expect(defaultService.maxTokens).toBe(4000);
            expect(defaultService.defaultTemperature).toBe(0.3);
        });

        test('should initialize with provided options', () => {
            // Verify OpenAI client was created with custom values
            expect(OpenAI).toHaveBeenCalledWith(expect.objectContaining({
                apiKey: 'test-api-key',
                baseURL: 'http://test-api.local/v1'
            }));

            // Verify custom model properties
            expect(llmService.model).toBe('test-model');
            expect(llmService.maxTokens).toBe(2000);
            expect(llmService.defaultTemperature).toBe(0.5);
        });
    });

    // Test basic query functionality
    describe('Query Method', () => {
        test('should format messages correctly and return successful response', async () => {
            // Mock successful API response
            mockOpenAIInstance.chat.completions.create.mockResolvedValue({
                choices: [
                    {
                        message: {
                            content: 'This is a test response'
                        }
                    }
                ]
            });

            // Call query method
            const result = await llmService.query(
                'You are a helpful assistant',
                'Tell me about testing'
            );

            // Verify request was formatted correctly
            expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith({
                model: 'test-model',
                messages: [
                    { role: 'system', content: 'You are a helpful assistant' },
                    { role: 'user', content: 'Tell me about testing' }
                ],
                max_tokens: 2000,
                temperature: 0.5
            });

            // Verify result format
            expect(result).toEqual({
                success: true,
                data: 'This is a test response'
            });
        });

        test('should include additional messages when provided', async () => {
            // Mock API response
            mockOpenAIInstance.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: 'Response with history' } }]
            });

            // Call query with extra messages
            await llmService.query(
                'System prompt',
                'User query',
                {
                    extraMessages: [
                        { role: 'assistant', content: 'Previous response' },
                        { role: 'user', content: 'Follow-up question' }
                    ]
                }
            );

            // Verify all messages were included
            expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    messages: [
                        { role: 'system', content: 'System prompt' },
                        { role: 'user', content: 'User query' },
                        { role: 'assistant', content: 'Previous response' },
                        { role: 'user', content: 'Follow-up question' }
                    ]
                })
            );
        });

        test('should handle JSON response format when specified', async () => {
            // Mock JSON response
            const jsonContent = JSON.stringify({
                key1: 'value1',
                key2: 'value2'
            });

            mockOpenAIInstance.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: jsonContent } }]
            });

            // Call query with JSON format specified
            const result = await llmService.query(
                'System prompt',
                'Return JSON',
                {
                    responseFormat: { type: 'json_object' }
                }
            );

            // Verify request included response format
            expect(mockOpenAIInstance.chat.completions.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    response_format: { type: 'json_object' }
                })
            );

            // Verify JSON was parsed
            expect(result).toEqual({
                success: true,
                data: {
                    key1: 'value1',
                    key2: 'value2'
                }
            });
        });

        test('should handle JSON parsing errors', async () => {
            // Mock invalid JSON response
            mockOpenAIInstance.chat.completions.create.mockResolvedValue({
                choices: [{ message: { content: 'Not valid JSON' } }]
            });

            // Call query with JSON format specified
            const result = await llmService.query(
                'System prompt',
                'Return JSON',
                {
                    responseFormat: { type: 'json_object' }
                }
            );

            // Verify error handling
            expect(result).toEqual({
                success: false,
                error: 'JSON parsing failed',
                rawContent: 'Not valid JSON'
            });
        });

        test('should handle API errors gracefully', async () => {
            // Mock API error
            const apiError = new Error('API error');
            apiError.error = { message: 'Detailed error information' };

            mockOpenAIInstance.chat.completions.create.mockRejectedValue(apiError);

            // Call query
            const result = await llmService.query(
                'System prompt',
                'User query'
            );

            // Verify error handling
            expect(result).toEqual({
                success: false,
                error: 'API error',
                details: 'Detailed error information'
            });
        });
    });

    // Test long text processing
    describe('Long Text Processing', () => {
        test('should process text directly if shorter than chunk size', async () => {
            // Mock the query method
            llmService.query = jest.fn().mockResolvedValue({
                success: true,
                data: 'Processed short text'
            });

            // Call processLongText with short text
            const shortText = 'This is a short text';
            const result = await llmService.processLongText(
                'System prompt',
                shortText,
                { chunkSize: 1000 }
            );

            // Verify query was called directly with full text
            expect(llmService.query).toHaveBeenCalledTimes(1);
            expect(llmService.query).toHaveBeenCalledWith(
                'System prompt',
                shortText,
                expect.any(Object)
            );

            // Verify result
            expect(result).toEqual({
                success: true,
                data: 'Processed short text'
            });
        });

        test('should split long text into chunks and process each chunk', async () => {
            // Create a long text that will be split into chunks
            const longText = 'A'.repeat(5000) + '\n\n' + 'B'.repeat(5000) + '\n\n' + 'C'.repeat(5000);

            // Mock the query method to handle chunks and final merge
            llmService.query = jest.fn()
                .mockResolvedValueOnce({ success: true, data: 'Result chunk 1' })
                .mockResolvedValueOnce({ success: true, data: 'Result chunk 2' })
                .mockResolvedValueOnce({ success: true, data: 'Result chunk 3' })
                .mockResolvedValueOnce({ success: true, data: 'Merged result' });

            // Call processLongText with options
            const result = await llmService.processLongText(
                'System prompt',
                longText,
                {
                    chunkSize: 6000,
                    overlapSize: 500,
                    chunkPrompt: 'Chunk specific prompt',
                    mergePrompt: 'Merge prompt'
                }
            );

            // Verify each chunk was processed
            expect(llmService.query).toHaveBeenCalledTimes(4); // 3 chunks + 1 merge

            // Verify chunk prompts were used
            expect(llmService.query.mock.calls[0][0]).toBe('Chunk specific prompt');
            expect(llmService.query.mock.calls[1][0]).toBe('Chunk specific prompt');
            expect(llmService.query.mock.calls[2][0]).toBe('Chunk specific prompt');

            // Verify merge prompt was used
            expect(llmService.query.mock.calls[3][0]).toBe('Merge prompt');

            // Verify final result
            expect(result).toEqual({
                success: true,
                data: 'Merged result'
            });
        });

        test('should handle errors during chunk processing', async () => {
            const longText = 'A'.repeat(6000) + '\n\n' + 'B'.repeat(6000);

            // Mock query to succeed for first chunk but fail for second
            llmService.query = jest.fn()
                .mockResolvedValueOnce({ success: true, data: 'Result chunk 1' })
                .mockResolvedValueOnce({ success: false, error: 'Chunk 2 failed' })
                .mockResolvedValueOnce({ success: true, data: 'Merged with error note' });

            // Call processLongText
            const result = await llmService.processLongText(
                'System prompt',
                longText,
                { chunkSize: 7000 }
            );

            // Verify merge was still attempted
            expect(llmService.query).toHaveBeenCalledTimes(3);

            // Verify result contains merged data
            expect(result).toEqual({
                success: true,
                data: 'Merged with error note'
            });

            // Verify that an error message was passed to merge
            const mergeCall = llmService.query.mock.calls[2];
            expect(mergeCall[1]).toContain('[第2部分处理失败');
        });

        test('should handle errors during the merge process', async () => {
            const longText = 'A'.repeat(6000) + '\n\n' + 'B'.repeat(6000);

            // Mock query to succeed for chunks but fail during merge
            llmService.query = jest.fn()
                .mockResolvedValueOnce({ success: true, data: 'Result chunk 1' })
                .mockResolvedValueOnce({ success: true, data: 'Result chunk 2' })
                .mockResolvedValueOnce({ success: false, error: 'Merge failed' });

            // Call processLongText
            const result = await llmService.processLongText(
                'System prompt',
                longText,
                { chunkSize: 7000 }
            );

            // Verify result contains error
            expect(result).toEqual({
                success: false,
                error: 'Merge failed'
            });
        });
    });

    // Test text splitting utility
    describe('Text Splitting Utility', () => {
        test('should split text at paragraph boundaries when possible', () => {
            const text = 'Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.\n\nParagraph 4.';

            // Call private method directly (for testing purposes)
            const chunks = llmService._splitTextIntoChunks(text, 25, 5);

            // Verify chunks respect paragraph boundaries
            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toBe('Paragraph 1.\n\nParagraph 2.');
            expect(chunks[1]).toBe('Paragraph 3.\n\nParagraph 4.');
        });

        test('should split text at sentence boundaries when paragraphs are too long', () => {
            const text = 'Sentence one. Sentence two. Sentence three. Sentence four.';

            // Call private method directly
            const chunks = llmService._splitTextIntoChunks(text, 25, 5);

            // Verify chunks respect sentence boundaries
            expect(chunks).toHaveLength(2);
            expect(chunks[0]).toBe('Sentence one. Sentence two.');
            expect(chunks[1]).toContain('Sentence three. Sentence four.');
        });

        test('should handle text without clear boundaries', () => {
            const text = 'ThisIsAReallyLongStringWithoutAnyBoundariesThisIsAReallyLongStringWithoutAnyBoundaries';

            // Call private method directly
            const chunks = llmService._splitTextIntoChunks(text, 30, 0);

            // Verify text is split by size even without boundaries
            expect(chunks.length).toBeGreaterThan(1);
            expect(chunks[0].length).toBeLessThanOrEqual(30);
        });

        test('should apply overlap between chunks', () => {
            const text = 'Part A content.\n\nPart B content.\n\nPart C content.\n\nPart D content.';

            // Call private method with overlap
            const chunks = llmService._splitTextIntoChunks(text, 30, 10);

            // Verify overlap is applied
            expect(chunks.length).toBeGreaterThan(1);

            // Check that end of first chunk appears at start of second chunk
            const overlapText = chunks[0].substring(chunks[0].length - 10);
            expect(chunks[1].startsWith(overlapText)).toBe(true);
        });
    });
});
