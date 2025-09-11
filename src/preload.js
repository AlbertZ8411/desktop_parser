// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
/**
 * Preload script for the Document Analysis Application
 * Creates a secure bridge between renderer and main processes
 */
const { contextBridge, ipcRenderer } = require('electron');

/**
 * API exposed to renderer process
 * Provides methods for document operations and LLM interactions
 */
contextBridge.exposeInMainWorld('documentAPI', {
    /**
     * Upload and parse a document file
     * @returns {Promise<Object>} Result with document text and metadata
     */
    uploadDocument: async () => {
        return await ipcRenderer.invoke('document:upload');
    },

    /**
     * Analyze document text using specified analysis type
     * @param {string} text - Document text to analyze
     * @param {string} analysisType - Type of analysis to perform ('general', 'entities', 'summary')
     * @returns {Promise<Object>} Analysis results
     */
    analyzeDocument: async (text, analysisType) => {
        return await ipcRenderer.invoke('document:analyze', { text, analysisType });
    },

    /**
     * Save analysis results to a file
     * @param {Object|string} data - Data to save
     * @param {string} fileName - Suggested file name
     * @returns {Promise<Object>} Result of save operation
     */
    saveResults: async (data, fileName) => {
        return await ipcRenderer.invoke('results:save', { data, fileName });
    }
});

/**
 * API for LLM service operations
 */
contextBridge.exposeInMainWorld('llmAPI', {
    /**
     * Check if LLM service is available
     * @returns {Promise<Object>} Status of LLM service
     */
    checkStatus: async () => {
        return await ipcRenderer.invoke('llm:check-status');
    }
});

/**
 * Utility functions for the renderer
 */
contextBridge.exposeInMainWorld('utils', {
    /**
     * Format timestamp to human-readable date string
     * @param {number} timestamp - Unix timestamp
     * @returns {string} Formatted date string
     */
    formatDate: (timestamp) => {
        return new Date(timestamp).toLocaleString();
    },

    /**
     * Get file size in human-readable format
     * @param {number} bytes - Size in bytes
     * @returns {string} Formatted size string (e.g., "1.5 MB")
     */
    formatFileSize: (bytes) => {
        if (bytes === 0) return '0 Bytes';

        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));

        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
});
