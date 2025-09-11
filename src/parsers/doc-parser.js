// src/parsers/DocParser.js
const mammoth = require('mammoth');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const util = require('util');

/**
 * Word doc file parser
 */
class DocParser {
    /**
     * parse doc
     * @param {string} filePath
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async parseFile(filePath, options = {}) {
        try {

            this._validateFile(filePath);

            const fileInfo = this._getFileInfo(filePath);

            if (fileInfo.size > (options.largeFileSizeThreshold || 10 * 1024 * 1024)) {

                return await this._parseDocumentStreaming(filePath, fileInfo);
            } else {

                return await this._parseDocumentStandard(filePath, fileInfo);
            }
        } catch (error) {
            throw new Error(`Failed to parse file: ${error.message}`);
        }
    }

    /**
     * validate
     * @private
     */
    _validateFile(filePath) {
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            throw new Error('No file');
        }

        // 检查文件扩展名
        const ext = path.extname(filePath).toLowerCase();
        if (!['.doc', '.docx'].includes(ext)) {
            throw new Error('Support .doc and.docx only!');
        }
    }

    /**
     * get info
     * @private
     */
    _getFileInfo(filePath) {
        const stats = fs.statSync(filePath);
        return {
            name: path.basename(filePath),
            path: filePath,
            extension: path.extname(filePath).toLowerCase(),
            size: stats.size,
            lastModified: stats.mtime
        };
    }

    /**
     * standard parsing doc
     * @private
     */
    async _parseDocumentStandard(filePath, fileInfo) {
       const textResult = await mammoth.extractRawText({ path: filePath });

        const htmlResult = await mammoth.convertToHtml({ path: filePath });

        const structuredResult = await mammoth.convert({
            path: filePath,
            transformDocument: mammoth.transforms.paragraph(this._transformParagraph)
        });

        return {
            fileInfo,
            content: {
                text: textResult.value,
                html: htmlResult.value,
                structured: structuredResult.value
            },
            metadata: this._extractMetadata(textResult, htmlResult),
            warnings: [...textResult.messages, ...htmlResult.messages]
        };
    }

    /**
     * streaming doc for large files
     * @private
     */
    async _parseDocumentStreaming(filePath, fileInfo) {

        const fileStream = fs.createReadStream(filePath);

        const chunks = [];
        for await (const chunk of fileStream) {
            chunks.push(chunk);
        }
        const buffer = Buffer.concat(chunks);

        // 使用buffer进行解析
        const textResult = await mammoth.extractRawText({ buffer });

        return {
            fileInfo,
            content: {
                text: textResult.value,
                html: '',
                structured: ''
            },
            metadata: {
                processingMode: 'streaming',
                processingTime: new Date()
            },
            warnings: [...textResult.messages]
        };
    }

    /**
     * transform paragraph
     * @private
     */
    _transformParagraph(paragraph) {
        if (paragraph.styleId && paragraph.styleId.startsWith("heading")) {
            const level = paragraph.styleId.replace("heading", "");
            return { prefix: `## H${level}: `, suffix: "\n\n" };
        }

        if (paragraph.styleId === "ListParagraph") {
            return { prefix: "• ", suffix: "\n" };
        }

        return { prefix: "", suffix: "\n\n" };
    }

    /**
     * extract meta data
     * @private
     */
    _extractMetadata(textResult, htmlResult) {

        return {
            textLength: textResult.value.length,
            estimatedWordCount: textResult.value.split(/\s+/).length,
            hasImages: htmlResult.value.includes('<img'),
            processingTime: new Date()
        };
    }
}

module.exports = DocParser;
