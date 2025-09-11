//const { app, BrowserWindow, ipcMain } = require('electron');
//const path = require('node:path');
// const { MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY, MAIN_WINDOW_WEBPACK_ENTRY} = require('@electron-forge/plugin-webpack/lib/utils/webpack-paths')


// Handle creating/removing shortcuts on Windows when installing/uninstalling.


/**
 * Main process for the Document Analysis Application
 * Initializes Electron app and manages services
 */
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
require('dotenv/config')


// Import our services
const LLMService = require('./services/llm-service');
const DocAnalyzer = require('./analyzers/doc-analyzer');
const DocParser = require('./parsers/doc-parser');

// Configuration
const CONFIG = {
  llm: {
    baseUrl: process.env.LLM_API_URL || 'http://localhost:11434',
    model: process.env.LLM_MODEL || 'gpt-oss:20b',
    apiKey: process.env.OSS_KEY,
    temperature: 0.1,
    maxTokens: 2000
  },
  window: {
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600
  }
};

// Service instances
let llmService;
let docAnalyzer;
let docParser;

// Main window reference
let mainWindow;

/**
 * Creates the main application window
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: CONFIG.window.width,
    height: CONFIG.window.height,
    minWidth: CONFIG.window.minWidth,
    minHeight: CONFIG.window.minHeight,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const loadUrl = MAIN_WINDOW_WEBPACK_ENTRY;
  if (loadUrl.startsWith('http://') || loadUrl.startsWith('https://')) {
    mainWindow.loadURL(loadUrl);
  } else {
    mainWindow.loadFile(loadUrl);
  }

  // Dev tools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

/**
 * Initialize services needed for document analysis
 */
function initializeServices() {
  // Initialize LLM Service
  llmService = new LLMService(CONFIG.llm);

  // Initialize Document Analyzer
  docAnalyzer = new DocAnalyzer(llmService);

  // Initialize Document Parser
  docParser = new DocParser();

  console.log('Services initialized successfully');
}

/**
 * Setup IPC handlers for renderer process communication
 */
function setupIpcHandlers() {
  // Handle document upload and parsing
  ipcMain.handle('document:upload', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Documents', extensions: ['doc', 'docx'] }
        ]
      });

      if (canceled || filePaths.length === 0) {
        return { success: false, error: 'No file selected' };
      }

      const filePath = filePaths[0];
      const fileExtension = path.extname(filePath).toLowerCase();

      // Parse document based on file type
      const document = await docParser.parseFile(filePath);

      return {
        success: true,
        data: {
          text: document,
          filePath,
          fileType: fileExtension,
          fileName: path.basename(filePath)
        }
      };
    } catch (error) {
      console.error('Error uploading document:', error);
      return {
        success: false,
        error: error.message || 'Failed to upload document'
      };
    }
  });

  // Handle document analysis
  ipcMain.handle('document:analyze', async (event, { text, analysisType }) => {
    try {
      let result;

      switch (analysisType) {
        case 'general':
          result = await docAnalyzer.analyzeDocument(text);
          break;
        case 'entities':
          result = await docAnalyzer.extractEntities(text);
          break;
        case 'summary':
          result = await docAnalyzer.summarizeDocument(text);
          break;
        default:
          throw new Error(`Unknown analysis type: ${analysisType}`);
      }

      return result;
    } catch (error) {
      console.error('Error analyzing document:', error);
      return {
        success: false,
        error: error.message || 'Failed to analyze document'
      };
    }
  });

  // Check LLM service status
  ipcMain.handle('llm:check-status', async () => {
    try {
      const isAvailable = await llmService.checkAvailability();
      return {
        success: true,
        available: isAvailable
      };
    } catch (error) {
      console.error('Error checking LLM status:', error);
      return {
        success: false,
        available: false,
        error: error.message
      };
    }
  });

  // Save analysis results
  ipcMain.handle('results:save', async (event, { data, fileName }) => {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Analysis Results',
        defaultPath: fileName || 'analysis-results.json',
        filters: [
          { name: 'JSON', extensions: ['json'] },
          { name: 'Text', extensions: ['txt'] }
        ]
      });

      if (canceled || !filePath) {
        return { success: false, error: 'Save operation canceled' };
      }

      // Convert to string if object
      const content = typeof data === 'object' ? JSON.stringify(data, null, 2) : data;

      fs.writeFileSync(filePath, content, 'utf-8');

      return {
        success: true,
        filePath
      };
    } catch (error) {
      console.error('Error saving results:', error);
      return {
        success: false,
        error: error.message || 'Failed to save results'
      };
    }
  });
}

// App initialization
app.whenReady().then(() => {
  initializeServices();
  setupIpcHandlers();
  createWindow();

  // MacOS-specific behavior
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// App cleanup
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
