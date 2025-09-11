// tests/unit/DocAnalyzer.test.js
const DocAnalyzer = require('../../src/analyzers/doc-analyzer');

describe('DocAnalyzer', () => {
    let mockLLMService;
    let docAnalyzer;

    beforeEach(() => {
        // Create a mock LLM service
        mockLLMService = {
            query: jest.fn()
        };

        // Initialize DocAnalyzer with mock service
        docAnalyzer = new DocAnalyzer(mockLLMService);
    });

    describe('analyzeDocument', () => {
        test('should analyze small document as a single chunk', async () => {
            // Setup mock response
            mockLLMService.query.mockResolvedValue({
                success: true,
                data: 'Analysis result'
            });

            // Call the method
            const result = await docAnalyzer.analyzeDocument('Small document text');

            // Assertions
            expect(result.success).toBe(true);
            expect(result.data).toBe('Analysis result');
            expect(mockLLMService.query).toHaveBeenCalledTimes(1);
        });

        test('should split large document into chunks', async () => {
            // Create a large document
            const largeDocument = 'A'.repeat(10000);

            // Setup mock response
            mockLLMService.query.mockResolvedValue({
                success: true,
                data: 'Chunk analysis'
            });

            // Call the method
            const result = await docAnalyzer.analyzeDocument(largeDocument);

            // Assertions
            expect(result.success).toBe(true);
            // Should have been called multiple times (at least twice for 10000 chars)
            expect(mockLLMService.query.mock.calls.length).toBeGreaterThan(1);
        });

        test('should handle errors', async () => {
            // Setup mock error response
            mockLLMService.query.mockResolvedValue({
                success: false,
                error: 'Service error'
            });

            // Call the method
            const result = await docAnalyzer.analyzeDocument('Document with error');

            // Assertions
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    // Additional tests for other methods...
});
