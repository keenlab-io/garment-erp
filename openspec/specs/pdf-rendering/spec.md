# PDF Rendering

## Purpose
HTML-to-PDF rendering via a shared, lazily-started headless browser that runs only inside the pdf background worker.

## Requirements

### Requirement: HTML to PDF rendering
The system SHALL provide a PDF service that renders an HTML document string into a PDF buffer server-side using headless Chromium (puppeteer).

#### Scenario: Render HTML to PDF
- **WHEN** a caller invokes the render operation with an HTML string
- **THEN** the service returns a valid PDF document whose content reflects the rendered HTML

### Requirement: Shared lazily-started browser lifecycle
The PDF service SHALL start a single shared headless browser instance lazily on first render, launched with the `--no-sandbox` flag, SHALL reuse that instance across subsequent renders, and MUST close it on application shutdown.

#### Scenario: Browser started on first use only
- **WHEN** the application boots and no render has been requested
- **THEN** no browser process is running; the browser is launched only when the first render is invoked

#### Scenario: Browser reused across renders
- **WHEN** a second render is requested after the first has completed
- **THEN** the existing browser instance is reused rather than a new browser being launched

#### Scenario: Browser closed on shutdown
- **WHEN** the application shuts down after the browser has been started
- **THEN** the shared browser process is closed and no orphaned Chromium process remains

### Requirement: Rendering runs only in the pdf background worker
PDF generation MUST execute only inside the `pdf` background queue worker, never synchronously within an HTTP request handler; request handlers that trigger document generation SHALL enqueue a job and respond without waiting for the render.

#### Scenario: Document generation is asynchronous
- **WHEN** an API endpoint triggers generation of a PDF document
- **THEN** the endpoint enqueues a job on the `pdf` queue and returns an accepted response with a job reference, without blocking on the render

#### Scenario: Worker performs the render
- **WHEN** the `pdf` queue worker processes a render job
- **THEN** the worker invokes the PDF service to produce the document and stores or dispatches the result as the job specifies
