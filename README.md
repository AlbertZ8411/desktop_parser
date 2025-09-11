# desktop_parser

DocAnalyzer
Project Overview
DocAnalyzer is a powerful document analysis tool that leverages Large Language Models (LLMs) to intelligently analyze, extract, and summarize various types of documents. This project aims to simplify document processing workflows, improve information extraction efficiency, and help users quickly understand document content through structured outputs.
Main Features
* Document Analysis & Summary Extraction: Automatically analyzes document structure, extracts key content, and generates readable summaries
* Intelligent Entity Recognition: Extracts key entities such as people, organizations, locations from text
* Document Importance Assessment: Evaluates the importance level of document content and identifies key points
* Document Outline Generation: Automatically generates structured document outlines, showing hierarchical relationships
* Document Chunking Processing: Intelligently processes long documents to ensure comprehensive analysis
Technical Highlights
LLM Interaction Mechanism
The project's most distinctive feature is its efficient LLM interaction mechanism:
1. Strict JSON Format Control:
    * Carefully designed prompts ensure LLM outputs standardized JSON format
    * Includes detailed format specifications and error handling mechanisms
    * Achieves seamless conversion from natural language to structured data
2. Intelligent Prompt Generation:
    * Dynamically generates optimal prompts based on different analysis tasks
    * Built-in multiple analysis templates to ensure LLM accurately understands task requirements
    * Provides custom prompt capabilities to meet specific scenario needs
3. Exception Handling & JSON Repair:
    * Intelligently detects and repairs non-standard JSON returned by LLM
    * Multi-level error handling ensures service stability
    * Optimized retry mechanisms improve success rate
4. Using gpt-oss:20b Model:
    * Leverages open-source large language model for document analysis
    * Provides high-quality semantic understanding capabilities
    * Supports local deployment for data security
Installation and Usage
Installing Dependencies
npm install
Running in Development Environment
npm start
Running Unit Tests
npm test
Building the Application
npm run make
Core Interaction Process
1. Document Reception & Preprocessing:
    * Receive document input (supports multiple formats)
    * Text extraction and normalization
    * Intelligent chunk processing
2. LLM Analysis Request:
    * Build system prompt and user prompt based on task type
    * Set appropriate model parameters (temperature, token limits, etc.)
    * Send request to gpt-oss:20b model
3. Response Processing & Structuring:
    * Receive JSON response from LLM
    * Validate and repair JSON format
    * Convert to internal application data structures
4. Result Integration & Output:
    * Merge multiple chunk analysis results
    * Generate final analysis report
    * Provide multiple export formats
Development Guide
Requirements
* Node.js >= 14.0.0
* npm >= 6.0.0
* API key or local deployment for accessing gpt-oss:20b model
Model Configuration
Configure your LLM model in .env under the project root:
{
  "model": "gpt-oss:20b",
  "apiKey": "YOUR_API_KEY",
  "baseUrl": "http://localhost:11434/v1"
}
Custom Analysis Types
Create custom analyses by extending the AnalysisType class:
const customAnalysis = new AnalysisType({
  name: "custom",
  promptTemplate: "...",
  responseFormat: {...}
});
Contribution Guidelines
Pull Requests or Issues are welcome to help improve the project! Please ensure:
1. All tests pass
2. Code complies with project style guidelines
3. Detailed PR description is provided
License
Apache License 2.0

