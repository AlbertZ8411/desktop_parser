// tests/parsers/DocParser.test.js
const DocParser = require('../../src/parsers/DocParser');
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');

// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('mammoth');

describe('DocParser', () => {
    let docParser;

    // Setup before each test
    beforeEach(() => {
        // Create parser instance
        docParser = new DocParser();

        // Reset all mocks
        jest.clearAllMocks();

        // Mock path.extname method
        path.extname.mockImplementation((filePath) => {
            if (filePath.endsWith('.docx')) return '.docx';
            if (filePath.endsWith('.doc')) return '.doc';
            return '.unknown';
        });

        // Mock path.basename method
        path.basename.mockImplementation((filePath) => {
            return filePath.split('/').pop();
        });

        // Mock file existence check
        fs.existsSync.mockImplementation((filePath) => {
            return filePath.endsWith('.docx') || filePath.endsWith('.doc');
        });
    });

    // Cleanup
    afterEach(() => {
        jest.resetAllMocks();
    });

    // Test file validation
    describe('File Validation', () => {
        test('should successfully validate valid Word files', () => {
            // Private methods need to be tested through public methods or directly test the internal logic results
            expect(() => docParser._validateFile('test.docx')).not.toThrow();
            expect(() => docParser._validateFile('test.doc')).not.toThrow();
        });

        test('should throw error when file does not exist', () => {
            fs.existsSync.mockReturnValue(false);
            expect(() => docParser._validateFile('missing.docx')).toThrow('Document does not exist');
        });

        test('should throw error for unsupported file types', () => {
            expect(() => docParser._validateFile('test.pdf')).toThrow('Unsupported file format');
        });
    });

    // Test file info retrieval
    describe('File Info Retrieval', () => {
        test('should correctly retrieve file information', () => {
            // Mock fs.statSync to return file statistics
            fs.statSync.mockReturnValue({
                size: 12345,
                mtime: new Date('2025-01-01')
            });

            const fileInfo = docParser._getFileInfo('test.docx');

            expect(fileInfo).toEqual({
                name: 'test.docx',
                path: 'test.docx',
                extension: '.docx',
                size: 12345,
                lastModified: expect.any(Date)
            });

            expect(fs.statSync).toHaveBeenCalledWith('test.docx');
        });
    });

    // Test standard document parsing
    describe('Standard Document Parsing', () => {
        const mockFileInfo = {
            name: 'test.docx',
            path: 'test.docx',
            extension: '.docx',
            size: 5000, // File size less than threshold
            lastModified: new Date()
        };

        test('should successfully parse standard-sized document', async () => {
            // Mock mammoth return results
            mammoth.extractRawText.mockResolvedValue({
                value: 'This is the plain text content of the document',
                messages: []
            });

            mammoth.convertToHtml.mockResolvedValue({
                value: '<p>This is the HTML content of the document</p>',
                messages: []
            });

            mammoth.convert.mockResolvedValue({
                value: '## H1: Title\n\nThis is structured content',
                messages: []
            });

            // Call parse method
            const result = await docParser._parseDocumentStandard('test.docx', mockFileInfo);

            // Verify results
            expect(result).toEqual({
                fileInfo: mockFileInfo,
                content: {
                    text: 'This is the plain text content of the document',
                    html: '<p>This is the HTML content of the document</p>',
                    structured: '## H1: Title\n\nThis is structured content'
                },
                metadata: expect.objectContaining({
                    textLength: 45,
                    estimatedWordCount: expect.any(Number)
                }),
                warnings: []
            });

            // Verify mammoth methods were correctly called
            expect(mammoth.extractRawText).toHaveBeenCalledWith({ path: 'test.docx' });
            expect(mammoth.convertToHtml).toHaveBeenCalledWith({ path: 'test.docx' });
            expect(mammoth.convert).toHaveBeenCalledWith(expect.objectContaining({
                path: 'test.docx'
            }));
        });

        test('should handle warnings during parsing process', async () => {
            // Mock mammoth return results with warnings
            mammoth.extractRawText.mockResolvedValue({
                value: 'Text content',
                messages: [{ type: 'warning', message: 'Plain text parsing warning' }]
            });

            mammoth.convertToHtml.mockResolvedValue({
                value: '<p>HTML content</p>',
                messages: [{ type: 'warning', message: 'HTML parsing warning' }]
            });

            mammoth.convert.mockResolvedValue({
                value: 'Structured content',
                messages: []
            });

            // Call parse method
            const result = await docParser._parseDocumentStandard('test.docx', mockFileInfo);

            // Verify warnings were correctly collected
            expect(result.warnings).toHaveLength(2);
            expect(result.warnings[0]).toEqual({ type: 'warning', message: 'Plain text parsing warning' });
            expect(result.warnings[1]).toEqual({ type: 'warning', message: 'HTML parsing warning' });
        });
    });

    // Test streaming document parsing
    describe('Streaming Document Parsing', () => {
        const mockFileInfo = {
            name: 'large.docx',
            path: 'large.docx',
            extension: '.docx',
            size: 20 * 1024 * 1024, // 20MB, larger than default threshold
            lastModified: new Date()
        };

        test('should successfully handle large documents', async () => {
            // Mock file stream
            const mockStream = {
                [Symbol.asyncIterator]: async function* () {
                    yield Buffer.from('First part content');
                    yield Buffer.from('Second part content');
                }
            };

            fs.createReadStream.mockReturnValue(mockStream);

            // Mock mammoth return results
            mammoth.extractRawText.mockResolvedValue({
                value: 'This is the content of a large document',
                messages: []
            });

            // Call parse method
            const result = await docParser._parseDocumentStreaming('large.docx', mockFileInfo);

            // Verify results
            expect(result).toEqual({
                fileInfo: mockFileInfo,
                content: {
                    text: 'This is the content of a large document',
                    html: '', // HTML not provided in streaming mode
                    structured: '' // Structured text not provided in streaming mode
                },
                metadata: expect.objectContaining({
                    processingMode: 'streaming'
                }),
                warnings: []
            });

            // Verify file stream was created
            expect(fs.createReadStream).toHaveBeenCalledWith('large.docx');
        });
    });

    // Test public parseDocument method (integration test)
    describe('Public parseDocument Method', () => {
        beforeEach(() => {
            // Mock internal methods
            docParser._validateFile = jest.fn();
            docParser._getFileInfo = jest.fn();
            docParser._parseDocumentStandard = jest.fn();
            docParser._parseDocumentStreaming = jest.fn();
        });

        test('should call standard parsing method for small files', async () => {
            // Mock _getFileInfo to return small file info
            const smallFileInfo = { size: 5 * 1024 * 1024 }; // 5MB
            docParser._getFileInfo.mockReturnValue(smallFileInfo);

            // Mock standard parsing method to return result
            const expectedResult = { success: true };
            docParser._parseDocumentStandard.mockResolvedValue(expectedResult);

            // Call public method
            const result = await docParser.parseDocument('small.docx');

            // Verify correct methods were called
            expect(docParser._validateFile).toHaveBeenCalledWith('small.docx');
            expect(docParser._getFileInfo).toHaveBeenCalledWith('small.docx');
            expect(docParser._parseDocumentStandard).toHaveBeenCalledWith('small.docx', smallFileInfo);
            expect(docParser._parseDocumentStreaming).not.toHaveBeenCalled();

            // Verify correct result was returned
            expect(result).toBe(expectedResult);
        });

        test('should call streaming parsing method for large files', async () => {
            // Mock _getFileInfo to return large file info
            const largeFileInfo = { size: 15 * 1024 * 1024 }; // 15MB
            docParser._getFileInfo.mockReturnValue(largeFileInfo);

            // Mock streaming parsing method to return result
            const expectedResult = { success: true };
            docParser._parseDocumentStreaming.mockResolvedValue(expectedResult);

            // Call public method, using default 10MB threshold
            const result = await docParser.parseDocument('large.docx');

            // Verify correct methods were called
            expect(docParser._validateFile).toHaveBeenCalledWith('large.docx');
            expect(docParser._getFileInfo).toHaveBeenCalledWith('large.docx');
            expect(docParser._parseDocumentStreaming).toHaveBeenCalledWith('large.docx', largeFileInfo);
            expect(docParser._parseDocumentStandard).not.toHaveBeenCalled();

            // Verify correct result was returned
            expect(result).toBe(expectedResult);
        });

        test('should properly catch errors during parsing process', async () => {
            // Mock _validateFile to throw error
            docParser._validateFile.mockImplementation(() => {
                throw new Error('Validation error');
            });

            // Call and verify error handling
            await expect(docParser.parseDocument('invalid.docx')).rejects.toThrow('Document parsing failed: Validation error');
        });
    });

    // Test paragraph transformation function
    describe('Paragraph Transformation Function', () => {
        test('should correctly process heading paragraphs', () => {
            const headingParagraph = { styleId: 'heading1' };
            const result = docParser._transformParagraph(headingParagraph);

            expect(result).toEqual({
                prefix: '## H1: ',
                suffix: '\n\n'
            });
        });

        test('should correctly process list paragraphs', () => {
            const listParagraph = { styleId: 'ListParagraph' };
            const result = docParser._transformParagraph(listParagraph);

            expect(result).toEqual({
                prefix: '• ',
                suffix: '\n'
            });
        });

        test('should correctly process normal paragraphs', () => {
            const normalParagraph = { styleId: 'normal' };
            const result = docParser._transformParagraph(normalParagraph);

            expect(result).toEqual({
                prefix: '',
                suffix: '\n\n'
            });
        });
    });
});
