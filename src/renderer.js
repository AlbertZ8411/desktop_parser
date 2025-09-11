/**
 * Renderer process for the Document Analysis Application
 * Handles UI interactions and displays analysis results
 */
require('./index.css');

// DOM Elements
const uploadButton = document.getElementById('upload-btn');
const analyzeButton = document.getElementById('analyze-btn');
const saveButton = document.getElementById('save-btn');
const analysisTypeSelect = document.getElementById('analysis-type');
const documentInfo = document.getElementById('document-info');
const resultsContainer = document.getElementById('results-container');
const loadingSpinner = document.getElementById('loading-spinner');
const statusMessage = document.getElementById('status-message');
const llmStatus = document.getElementById('llm-status');

// State management
let currentDocument = null;
let currentResults = null;

/**
 * Initialize the application
 */
function initializeApp() {
    checkLLMStatus();
    setupEventListeners();
    updateUIState();
}

/**
 * Check if LLM service is available
 */
async function checkLLMStatus() {
    try {
        llmStatus.textContent = 'Checking LLM service...';
        llmStatus.className = 'status pending';

        const { success, available, error } = await window.llmAPI.checkStatus();

        if (success && available) {
            llmStatus.textContent = 'LLM Service: Connected';
            llmStatus.className = 'status connected';
        } else {
            llmStatus.textContent = `LLM Service: Unavailable ${error ? '- ' + error : ''}`;
            llmStatus.className = 'status error';
        }
    } catch (error) {
        console.error('Failed to check LLM status:', error);
        llmStatus.textContent = 'LLM Service: Connection Error';
        llmStatus.className = 'status error';
    }
}

/**
 * Set up event listeners for UI interactions
 */
function setupEventListeners() {
    // Document upload button
    uploadButton.addEventListener('click', handleDocumentUpload);

    // Analysis button
    analyzeButton.addEventListener('click', handleDocumentAnalysis);

    // Save results button
    saveButton.addEventListener('click', handleSaveResults);

    // Analysis type selection
    analysisTypeSelect.addEventListener('change', () => {
        updateUIState();
    });
}

/**
 * Handle document upload
 */
async function handleDocumentUpload() {
    try {
        setLoading(true, 'Uploading document...');

        const result = await window.documentAPI.uploadDocument();

        console.log('Parsed document result:', result);
        console.log('Document text type:', typeof result.text);

        if (!result.success) {
            throw new Error(result.error || 'Failed to upload document');
        }

        currentDocument = result.data;
        currentResults = null;

        displayDocumentInfo(currentDocument);
        setLoading(false);
        updateUIState();

        statusMessage.textContent = 'Document uploaded successfully';
        statusMessage.className = 'success';
    } catch (error) {
        console.error('Document upload error:', error);
        setLoading(false);
        statusMessage.textContent = error.message;
        statusMessage.className = 'error';
    }
}

/**
 * Handle document analysis
 */
async function handleDocumentAnalysis() {
    if (!currentDocument) {
        statusMessage.textContent = 'Please upload a document first';
        statusMessage.className = 'error';
        return;
    }

    try {
        const analysisType = analysisTypeSelect.value;
        setLoading(true, `Analyzing document (${analysisType})...`);

        const result = await window.documentAPI.analyzeDocument(
            currentDocument.text,
            analysisType
        );

        if (!result.success) {
            throw new Error(result.error || 'Analysis failed');
        }

        currentResults = result;

        displayResults(result, analysisType);
        setLoading(false);
        updateUIState();

        statusMessage.textContent = 'Analysis completed successfully';
        statusMessage.className = 'success';
    } catch (error) {
        console.error('Analysis error:', error);
        setLoading(false);
        statusMessage.textContent = error.message;
        statusMessage.className = 'error';
    }
}

async function handleSaveResults() {
    if (!currentResults) {
        statusMessage.textContent = 'No results to save';
        statusMessage.className = 'error';
        return;
    }

    try {
        // Add debug logging to see what we're trying to save
        console.log("Current results before saving:", currentResults);

        // Check if results are empty
        const isEmpty =
            !currentResults ||
            (typeof currentResults === 'object' &&
                Object.keys(currentResults).filter(k => k !== 'success').length === 0) ||
            (currentResults.data === "" || currentResults.data === undefined);

        if (isEmpty) {
            throw new Error("Analysis results are empty. Please run the analysis again.");
        }

        // Format results properly to ensure data is included
        const formattedResults = formatResultsForSaving(currentResults);

        setLoading(true, 'Saving results...');

        const baseFileName = currentDocument?.fileName || 'document';
        const analysisType = analysisTypeSelect.value;
        const suggestedFileName = `${baseFileName.split('.')[0]}-${analysisType}-analysis.json`;

        // Pass the formatted results instead of potentially empty ones
        const result = await window.documentAPI.saveResults(
            formattedResults,
            suggestedFileName
        );

        if (!result.success) {
            throw new Error(result.error || 'Failed to save results');
        }

        setLoading(false);
        statusMessage.textContent = `Results saved to: ${result.filePath}`;
        statusMessage.className = 'success';
    } catch (error) {
        console.error('Save error:', error);
        setLoading(false);
        statusMessage.textContent = error.message;
        statusMessage.className = 'error';
    }
}

/**
 * Formats analysis results to ensure proper structure for saving
 * @param {Object} results - The analysis results to format
 * @returns {Object} Properly formatted results
 */
function formatResultsForSaving(results) {
    // If results already have the expected structure, just ensure data isn't empty
    if (results.success !== undefined && results.data !== undefined && results.meta !== undefined) {
        // If data is empty but we have rawAnalysis, use that instead
        if (!results.data && results.rawAnalysis) {
            results.data = results.rawAnalysis;
        }

        // If data is still empty but we have other properties, include those
        if (!results.data) {
            const resultsCopy = {...results};
            delete resultsCopy.success;
            delete resultsCopy.meta;
            delete resultsCopy.data;

            if (Object.keys(resultsCopy).length > 0) {
                results.data = resultsCopy;
            }
        }

        // Update metadata
        results.meta = {
            ...(results.meta || {}),
            timestamp: new Date().toISOString(),
            analysisType: analysisTypeSelect.value,
            documentName: currentDocument?.fileName || 'unknown',
            chunkCount: Array.isArray(results.data) ? results.data.length : 0
        };

        return results;
    }

    // Otherwise, create the proper structure
    return {
        success: true,
        data: results, // Use the entire results object as data
        meta: {
            timestamp: new Date().toISOString(),
            analysisType: analysisTypeSelect.value,
            documentName: currentDocument?.fileName || 'unknown',
            chunkCount: Array.isArray(results) ? results.length : 0
        }
    };
}

/**
 * Display document information
 * @param {Object} document - Document metadata and content
 */
function displayDocumentInfo(docData) {
    console.log("Document data received:", docData); // 调试用

    let filename = 'Unknown';
    let filesize = 'Unknown';
    let filetype = 'Unknown';
    let previewText = '';

    if (docData.info && docData.info.filename) {
        filename = docData.text.info.filename;
    } else if (docData.filename) {
        filename = docData.filename;
    } else if (docData.name) {
        filename = docData.name;
    } else if (docData.text && docData.text.fileInfo.name) {
        filename = docData.text.fileInfo.name;
    }

    if (docData.info && docData.info.filesize) {
        filesize = docData.info.filesize;
    } else if (docData.filesize) {
        filesize = docData.filesize;
    } else if (docData.size) {
        const bytes = parseInt(docData.size);
        if (!isNaN(bytes)) {
            if (bytes < 1024) filesize = bytes + ' bytes';
            else if (bytes < 1024 * 1024) filesize = (bytes / 1024).toFixed(2) + ' KB';
            else filesize = (bytes / (1024 * 1024)).toFixed(2) + ' MB';
        }
    } else if (docData.text && docData.text.fileInfo.size) {
        filesize = docData.text.fileInfo.size;
    }

    if (docData.info && docData.info.filetype) {
        filetype = docData.info.filetype;
    } else if (docData.filetype) {
        filetype = docData.filetype;
    } else if (docData.type) {
        filetype = docData.type;
    } else if (docData.text && docData.text.fileInfo.extension) {
        filetype = docData.text.fileInfo.extension;
    }

    if (docData.text) {
        if (typeof docData.text === 'string') {
            previewText = stripHtmlTags(docData.text);
        } else if (typeof docData.text === 'object') {
            if (Array.isArray(docData.text)) {

                previewText = docData.text.map(item =>
                    typeof item === 'string' ? stripHtmlTags(item) : String(item)
                ).join('\n');
            } else {
                try {
                    const textStr = JSON.stringify(docData.text, null, 2);
                    previewText = stripHtmlTags(textStr);
                } catch (e) {
                    previewText = 'Complex document structure (cannot display preview)';
                }
            }
        }
    } else if (docData.content) {
        if (typeof docData.content === 'string') {
            previewText = stripHtmlTags(docData.content);
        } else {
            try {
                previewText = stripHtmlTags(JSON.stringify(docData.content, null, 2));
            } catch (e) {
                previewText = 'Complex content structure (cannot display preview)';
            }
        }
    }

    if (previewText.length > 500) {
        previewText = previewText.substring(0, 500) + '...';
    }

    previewText = previewText
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // 更新UI
    const documentInfoElement = document.getElementById('document-info');
    documentInfoElement.innerHTML = `
        <div class="doc-info-item">
            <span class="label">File:</span>
            <span>${filename}</span>
        </div>
        <div class="doc-info-item">
            <span class="label">Size:</span>
            <span>${filesize}</span>
        </div>
        <div class="doc-info-item">
            <span class="label">Type:</span>
            <span>${filetype}</span>
        </div>
        <div class="doc-preview">
            <h3>Preview:</h3>
            <pre class="preview-content">${previewText}</pre>
        </div>
    `;

    // 启用分析按钮
    document.getElementById('analyze-btn').disabled = false;
}

function stripHtmlTags(html) {
    if (!html || typeof html !== 'string') return '';

    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return doc.body.textContent || '';
    } catch (e) {
        return html.replace(/<[^>]*>/g, '');
    }
}

// Update your displayResults function
function displayResults(results) {
    resultsContainer.innerHTML = '';

    // Check if we have valid results
    if (!results || !results.data) {
        resultsContainer.innerHTML = '<div class="error">No analysis results to display</div>';
        return;
    }

    const analysisType = results.meta?.analysisType || 'general';
    const data = results.data;

    // Create header
    const header = document.createElement('h3');
    header.textContent = `${analysisType.charAt(0).toUpperCase() + analysisType.slice(1)} Analysis Results`;
    resultsContainer.appendChild(header);

    // Format and display based on analysis type
    let formattedContent;
    if (analysisType === 'general') {
        formattedContent = formatGeneralAnalysis(data);
    } else if (analysisType === 'entity') {
        formattedContent = formatEntityAnalysis(data);
    } else if (analysisType === 'summary') {
        formattedContent = formatSummaryAnalysis(data);
    } else {
        formattedContent = formatGenericAnalysis(data);
    }

    resultsContainer.appendChild(formattedContent);
}

// Update your formatGeneralAnalysis function to handle the new data structure
function formatGeneralAnalysis(analysisData) {
    const container = document.createElement('div');
    container.className = 'analysis-results';

    // Handle case where analysisData is a simple string (older format)
    if (typeof analysisData === 'string') {
        const paragraphs = analysisData.split('\n').filter(p => p.trim().length > 0);
        paragraphs.forEach(paragraph => {
            const p = document.createElement('p');
            p.textContent = paragraph;
            container.appendChild(p);
        });
        return container;
    }

    // Handle new structured data format
    // Create statistics section
    const statsSection = document.createElement('div');
    statsSection.className = 'analysis-section';

    const statsTitle = document.createElement('h4');
    statsTitle.textContent = 'Document Statistics';
    statsSection.appendChild(statsTitle);

    const statsList = document.createElement('ul');

    // Add statistics if available
    if (analysisData.totalWords !== undefined) {
        const wordItem = document.createElement('li');
        wordItem.textContent = `Words: ${analysisData.totalWords}`;
        statsList.appendChild(wordItem);
    }

    if (analysisData.totalSentences !== undefined) {
        const sentenceItem = document.createElement('li');
        sentenceItem.textContent = `Sentences: ${analysisData.totalSentences}`;
        statsList.appendChild(sentenceItem);
    }

    if (analysisData.totalChunks !== undefined) {
        const chunkItem = document.createElement('li');
        chunkItem.textContent = `Analysis chunks: ${analysisData.totalChunks}`;
        statsList.appendChild(chunkItem);
    }

    statsSection.appendChild(statsList);
    container.appendChild(statsSection);

    // Create key terms section if available
    if (analysisData.topWords && analysisData.topWords.length > 0) {
        const termsSection = document.createElement('div');
        termsSection.className = 'analysis-section';

        const termsTitle = document.createElement('h4');
        termsTitle.textContent = 'Key Terms';
        termsSection.appendChild(termsTitle);

        const termsList = document.createElement('ul');
        analysisData.topWords.forEach(({word, count}) => {
            const termItem = document.createElement('li');
            termItem.textContent = `${word} (${count})`;
            termsList.appendChild(termItem);
        });

        termsSection.appendChild(termsList);
        container.appendChild(termsSection);
    }

    // Add excerpts if available
    if (analysisData.excerpts && analysisData.excerpts.length > 0) {
        const excerptSection = document.createElement('div');
        excerptSection.className = 'analysis-section';

        const excerptTitle = document.createElement('h4');
        excerptTitle.textContent = 'Content Excerpts';
        excerptSection.appendChild(excerptTitle);

        analysisData.excerpts.forEach(excerpt => {
            const p = document.createElement('p');
            p.className = 'excerpt';
            p.textContent = excerpt;
            excerptSection.appendChild(p);
        });

        container.appendChild(excerptSection);
    }

    // Add any other custom fields that might be in the data
    const otherFields = Object.keys(analysisData).filter(key =>
        !['totalWords', 'totalSentences', 'totalChunks', 'topWords', 'excerpts', 'analysisType'].includes(key));

    if (otherFields.length > 0) {
        const otherSection = document.createElement('div');
        otherSection.className = 'analysis-section';

        const otherTitle = document.createElement('h4');
        otherTitle.textContent = 'Additional Information';
        otherSection.appendChild(otherTitle);

        otherFields.forEach(field => {
            const fieldValue = analysisData[field];
            const fieldDiv = document.createElement('div');
            fieldDiv.className = 'field-item';

            const fieldName = document.createElement('strong');
            fieldName.textContent = field.replace(/([A-Z])/g, ' $1')
                .replace(/^./, str => str.toUpperCase()) + ': ';
            fieldDiv.appendChild(fieldName);

            const fieldText = document.createTextNode(
                typeof fieldValue === 'object' ? JSON.stringify(fieldValue) : fieldValue
            );
            fieldDiv.appendChild(fieldText);

            otherSection.appendChild(fieldDiv);
        });

        container.appendChild(otherSection);
    }

    // Add a fallback if the container is empty
    if (container.children.length === 0) {
        const emptyMsg = document.createElement('p');
        emptyMsg.textContent = 'Analysis completed successfully, but no specific insights were generated.';
        container.appendChild(emptyMsg);
    }

    return container;
}

// Generic formatter for other analysis types
function formatGenericAnalysis(data) {
    const container = document.createElement('div');
    container.className = 'analysis-results';

    // If data is a string, display it directly
    if (typeof data === 'string') {
        const p = document.createElement('p');
        p.textContent = data;
        container.appendChild(p);
        return container;
    }

    // Otherwise, display structured data
    for (const [key, value] of Object.entries(data)) {
        // Skip metadata or internal fields
        if (['success', 'meta', 'error'].includes(key)) continue;

        const section = document.createElement('div');
        section.className = 'analysis-section';

        // Format the key as a title
        const title = document.createElement('h4');
        title.textContent = key.replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase());
        section.appendChild(title);

        // Format the value based on its type
        if (Array.isArray(value)) {
            const list = document.createElement('ul');
            value.forEach(item => {
                const li = document.createElement('li');
                li.textContent = typeof item === 'object' ? JSON.stringify(item) : item;
                list.appendChild(li);
            });
            section.appendChild(list);
        } else if (typeof value === 'object' && value !== null) {
            const pre = document.createElement('pre');
            pre.textContent = JSON.stringify(value, null, 2);
            section.appendChild(pre);
        } else {
            const p = document.createElement('p');
            p.textContent = value;
            section.appendChild(p);
        }

        container.appendChild(section);
    }

    return container;
}

/**
 * Format entity extraction results
 * @param {Object} entities - Extracted entities by type
 * @returns {string} HTML representation of entities
 */
function formatEntities(entities) {
    if (!entities) return '<p>No entities found</p>';

    let html = '<div class="entities-container">';

    for (const [entityType, entityList] of Object.entries(entities)) {
        if (entityList && entityList.length > 0) {
            html += `
        <div class="entity-type">
          <h4>${entityType.charAt(0).toUpperCase() + entityType.slice(1)}</h4>
          <ul class="entity-list">
            ${entityList.map(entity => `<li>${entity}</li>`).join('')}
          </ul>
        </div>
      `;
        }
    }

    html += '</div>';
    return html;
}

/**
 * Set loading state
 * @param {boolean} isLoading - Whether the app is in loading state
 * @param {string} message - Optional loading message
 */
function setLoading(isLoading, message = '') {
    if (isLoading) {
        loadingSpinner.classList.remove('hidden');
        loadingSpinner.setAttribute('aria-label', message);

        // Disable buttons during loading
        uploadButton.disabled = true;
        analyzeButton.disabled = true;
        saveButton.disabled = true;
    } else {
        loadingSpinner.classList.add('hidden');
        updateUIState();
    }
}

/**
 * Update UI state based on current application state
 */
function updateUIState() {
    uploadButton.disabled = false;
    analyzeButton.disabled = !currentDocument;
    saveButton.disabled = !currentResults;

    // Additional UI updates based on selected analysis type
    const analysisType = analysisTypeSelect.value;

    // Add any specific UI adjustments based on analysis type
    switch (analysisType) {
        case 'entities':
            // Maybe adjust some UI elements specific to entity extraction
            break;
        case 'summary':
            // Maybe adjust some UI elements specific to summarization
            break;
        default:
            break;
    }
}

// Initialize app when the DOM content is loaded
document.addEventListener('DOMContentLoaded', initializeApp);
