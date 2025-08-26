/**
 * Core Viewer Module
 * 
 * Main OpenSeadragon viewer initialization and core functionality
 * Exactly matching backup viewer.js functionality
 */

// Global variables (exactly from backup)
var viewer;
var anno;
var currentTool = 'circle';
var currentPolarity = null;
var currentTab = 'manual';
var annotations = {
    manual: [],
    sam: []
};
var wsi_height;
var wsi_width;


// Tool mapping (from backup)
const toolMapping = {
    'drag': 'manual',
    'circle': 'manual',
    'freehand': 'manual',
    'rect': 'manual',
    'polygon': 'manual',
    'quadrilateral': 'manual',
    'point': 'manual',
    'scribble': 'manual',
    'sam-drag': 'sam',
    'sam-point': 'sam',
    'sam-rect': 'sam'
};

// Default tool configuration for each tab (from backup)
const tabDefaults = {
    'manual': { tool: 'drag', polarity: null },
    'sam': { tool: 'sam-drag', polarity: null }
};

// Tab navigation state (from backup)
let currentTabIndex = 0;
const maxVisibleTabs = 2;

// Quadrilateral tracking (from backup)
let quadrilateralMode = false;
let polygonVertexCount = 0;
let polygonObserver = null;

/**
 * Fallback addAnnotation function if module not loaded
 */
function ensureAddAnnotation(annotation) {
    console.log('🚀 ensureAddAnnotation called with:', annotation.id);
    
    if (typeof addAnnotation === 'function') {
        console.log('📞 Calling addAnnotation function from annotation manager');
        addAnnotation(annotation);
    } else if (typeof window.addAnnotation === 'function') {
        console.log('📞 Calling window.addAnnotation function from annotation manager');
        window.addAnnotation(annotation);
    } else {
        console.log('⚠️ No annotation manager found - annotation will not be listed in UI');
        console.log('📋 Annotation details:', JSON.stringify(annotation, null, 2));
    }
}


/**
 * Get current active tab
 */
function getCurrentTab() {
    const activeTab = document.querySelector('.tab-item.active');
    return activeTab ? activeTab.getAttribute('data-tab') : 'manual';
}

/**
 * Fallback selectAnnotation function if module not loaded  
 */
function ensureSelectAnnotation(annotation) {
    if (typeof selectAnnotation === 'function') {
        selectAnnotation(annotation);
    } else if (typeof window.selectAnnotation === 'function') {
        window.selectAnnotation(annotation);
    } else {
        // Fallback - just log for now
        console.log('📍 Fallback: Selected annotation', annotation.id);
    }
}

/**
 * Set active annotation tool (exactly from backup)
 */
function setActiveTool(tool) {
    currentTool = tool;
    console.log('🛠️ Setting active tool:', tool);
    console.log('🛠️ Tool starts with sam-?', tool.startsWith('sam-'));
    console.log('🛠️ SAM connected?', samConnected);
    console.log('🛠️ SAM live mode?', samLiveMode);
    
    
    // Reset quadrilateral mode for all tools except quadrilateral
    if (tool !== 'quadrilateral') {
        quadrilateralMode = false;
        stopQuadrilateralTracking();
    }
    
    const activePane = document.querySelector('.tab-pane.active');
    if (activePane) {
        activePane.querySelectorAll('.tool-button').forEach(btn => {
            btn.classList.remove('active');
        });
        
        const targetButton = activePane.querySelector(`[data-tool="${tool}"]`);
        if (targetButton) {
            targetButton.classList.add('active');
        }
    }
    
    // Update cursor based on tool selection
    updateCanvasCursor(tool);

    if (anno) {
        // Ensure drawing is enabled
        anno.setDrawingEnabled(true);
        
        try {
            switch(tool) {
                case 'drag':
                    // Disable drawing for drag tool
                    anno.setDrawingEnabled(false);
                    console.log('Set drag tool - annotation drawing disabled');
                    break;
                case 'sam-drag':
                    // Disable drawing for SAM drag tool
                    anno.setDrawingEnabled(false);
                    console.log('Set SAM drag tool - annotation drawing disabled');
                    break;
                case 'circle':
                    anno.setDrawingTool('circle');
                    console.log('Set circle tool');
                    break;
                case 'rect':
                    anno.setDrawingTool('rect');
                    console.log('Set rect tool');
                    break;
                case 'quadrilateral':
                    // Use polygon tool for quadrilateral
                    anno.setDrawingTool('polygon');
                    quadrilateralMode = true;
                    console.log('Set quadrilateral (polygon) tool');
                    break;
                case 'point':
                    anno.setDrawingTool('point');
                    console.log('Set point tool');
                    break;
                case 'freehand':
                    anno.setDrawingTool('freehand');
                    console.log('Set freehand tool');
                    break;
                case 'scribble':
                    anno.setDrawingTool('freehand');
                    console.log('Set scribble (freehand) tool');
                    break;
                case 'sam-point':
                    anno.setDrawingTool('point');
                    console.log('Set SAM point tool');
                    break;
                case 'sam-rect':
                    anno.setDrawingTool('rect');
                    console.log('Set SAM rect tool');
                    break;
                default:
                    anno.setDrawingTool(tool);
                    console.log('Set default tool:', tool);
            }
            
            // Verify the tool was set (skip API calls that may not be available)
            setTimeout(() => {
                console.log('Tool setting completed');
            }, 100);
            
        } catch (error) {
            console.error('Error setting drawing tool:', error);
        }
    } else {
        console.warn('Annotorious not initialized yet');
    }
}

/**
 * Update canvas cursor based on active tool
 */
function updateCanvasCursor(tool) {
    const canvas = document.getElementById('wsi-canvas');
    const osdCanvas = document.querySelector('.openseadragon-canvas');
    
    if (!canvas) return;
    
    // Remove all cursor classes
    canvas.classList.remove('cursor-drag', 'cursor-annotate');
    if (osdCanvas) {
        osdCanvas.classList.remove('cursor-drag', 'cursor-annotate');
    }
    
    // Add appropriate cursor class based on tool
    if (tool === 'drag' || tool === 'sam-drag') {
        canvas.classList.add('cursor-drag');
        if (osdCanvas) {
            osdCanvas.classList.add('cursor-drag');
        }
        console.log('🖱️ Set drag cursor');
    } else {
        // All other tools get crosshair cursor
        canvas.classList.add('cursor-annotate');
        if (osdCanvas) {
            osdCanvas.classList.add('cursor-annotate');
        }
        console.log('🖱️ Set annotation cursor');
    }
}

/**
 * Toggle polarity (from backup)
 */
function togglePolarity(polarity, button) {
    const currentPolarityButtons = button.parentElement.querySelectorAll('.polarity-button');
    
    if (currentPolarity === polarity) {
        currentPolarity = null;
        button.classList.remove('active');
    } else {
        currentPolarityButtons.forEach(btn => btn.classList.remove('active'));
        currentPolarity = polarity;
        button.classList.add('active');
    }
}

/**
 * Load TIFF file (exactly from backup)
 */
async function loadTiffFile(file) {
    console.log('Loading TIFF file:', file.name);
    
    try {
        const loadingDiv = document.getElementById('loading-indicator');
        if (loadingDiv) {
            loadingDiv.style.display = 'block';
            console.log('Loading indicator shown');
        }

        if (typeof OpenSeadragon === 'undefined') {
            throw new Error('OpenSeadragon is not loaded');
        }
        
        if (typeof OpenSeadragon.GeoTIFFTileSource === 'undefined') {
            throw new Error('GeoTIFFTileSource is not available. Make sure geotiff-tilesource is loaded.');
        }

        console.log('Getting tile sources...');
        const tiffTileSources = await OpenSeadragon.GeoTIFFTileSource.getAllTileSources(file, {
            logLatency: false,
        });

        console.log('Tile sources created:', tiffTileSources.length);

        if (viewer) {
            console.log('Destroying existing viewer');
            viewer.destroy();
        }

        console.log('Creating new viewer...');
        viewer = new OpenSeadragon.Viewer({
            id: "wsi-canvas",
            prefixUrl: "./node_modules/openseadragon/build/openseadragon/images/",
            zoomPerScroll: 2,
            zoomPerClick: 1,
            showNavigator: true,
            showHomeControl: false,
            showFullPageControl: false,
            showZoomControl: false,
            minZoomLevel: 0.25,
            maxZoomLevel: 40,
            tileSources: tiffTileSources,
            crossOriginPolicy: "Anonymous",
            ajaxWithCredentials: false
        });

        viewer.innerTracker.keyHandler = null;

        const fileBrowser = document.getElementById('file-browser');
        if (fileBrowser) {
            console.log('Hiding file browser');
            fileBrowser.style.display = 'none';
        }

        viewer.addHandler('open', function() {
            console.log('Viewer opened successfully');
            
            // Wait a bit for the viewer to fully initialize
            setTimeout(() => {
                setupAnnotations();
                setupTracking();
                setupDynamicImageInfoUpdates(); // Add dynamic viewport tracking
                
                // Make sure the viewer canvas is properly set up for annotations
                const canvas = viewer.canvas;
                if (canvas) {
                    console.log('Canvas found, setting up for annotations');
                    // Ensure the canvas is interactive
                    canvas.style.pointerEvents = 'auto';
                } else {
                    console.warn('Canvas not found');
                }
                
                if (loadingDiv) {
                    loadingDiv.style.display = 'none';
                    console.log('Loading indicator hidden');
                }
                const tiledImage = viewer.world.getItemAt(0);

                if (tiledImage) {
                    const dimensions = tiledImage.getContentSize();
                    wsi_height = dimensions.y
                    wsi_width = dimensions.x
                    console.log("image dimensions", wsi_width, "x", wsi_height);
                }

            }, 500); // Wait 500ms for viewer to stabilize
        });

        viewer.addHandler('open-failed', function(event) {
            console.error('Viewer failed to open:', event);
            throw new Error('Failed to open viewer');
        });

    } catch (error) {
        console.error('Error loading TIFF file:', error);
        
        let errorMessage = 'Error loading TIFF file. ';
        if (error.message.includes('GeoTIFFTileSource')) {
            errorMessage += 'GeoTIFF library not loaded properly. Please check your dependencies.';
        } else if (error.message.includes('OpenSeadragon')) {
            errorMessage += 'OpenSeadragon library not loaded properly.';
        } else {
            errorMessage += error.message;
        }
        
        alert(errorMessage);
        
        const loadingDiv = document.getElementById('loading-indicator');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    }
}

/**
 * Setup annotations (exactly from backup)
 */
function setupAnnotations() {
    try {
        console.log('Setting up annotations...');
        
        // Initialize Annotorious
        anno = OpenSeadragon.Annotorious(viewer, {
            allowEmpty: true,
            readOnly: false,
            gigapixelMode: true
        });
        
        // Add selector pack for additional tools
        if (typeof Annotorious !== 'undefined' && Annotorious.SelectorPack) {
            Annotorious.SelectorPack(anno);
        }

        // Enable drawing by default
        anno.setDrawingEnabled(true);
        
        // Handle popup field entry events
        anno.on('updateAnnotation', function(annotation) {
            console.log('📝 POPUP FIELDS:');
            if (annotation.body && Array.isArray(annotation.body)) {
                annotation.body.forEach((item, index) => {
                    if (item.value) {
                        console.log(`Field ${index + 1}: "${item.value}"`);
                    }
                });
            }
        });
        
        // Handle annotation creation events (from backup)
        anno.on('createAnnotation', function(annotation) {
            console.log('📝 Annotation created:', annotation.id);
            
            // Prevent Annotorious from automatically switching tools after creation
            if (currentTool.startsWith('sam-')) {
                console.log('🔒 Preventing tool switch for continuous SAM interaction');
                // We'll handle tool maintenance in the success callback
            }
            
            // Check if it's a SAM tool and process through SAM
            console.log('🔍 SAM connected:', samConnected);
            console.log('🔍 Current tool:', currentTool);
            console.log('🔍 Tool starts with sam-?', currentTool.startsWith('sam-'));
            
            if (currentTool.startsWith('sam-') && samConnected && samLiveMode) {
                console.log('🚀 Processing SAM annotation...');
                
                // Store the original annotation ID to remove later
                const originalAnnotationId = annotation.id;
                
                // Create a temporary annotation object that includes the selection data
                const tempAnnotation = {
                    ...annotation,
                    id: 'temp-' + Date.now(),
                    target: annotation.target
                };
                
                // Process SAM annotation without popups (editor disabled globally)
                console.log('⚡ Processing SAM annotation...');
                
                // Process with SAM asynchronously
                processSAMPrompt(tempAnnotation).then(samAnnotation => {
                    if (samAnnotation) {
                        console.log('✅ SAM processing successful - replacing annotation');
                        
                        // Transfer popup data (name/tags) from original to SAM result
                        if (annotation.body && annotation.body.length > 0) {
                            samAnnotation.body = annotation.body;
                            console.log('📋 Transferred popup data to SAM annotation');
                        }
                        
                        // Remove original prompt and add SAM result
                        try {
                            anno.removeAnnotation(originalAnnotationId);
                            anno.addAnnotation(samAnnotation);
                        } catch (error) {
                            console.warn('Could not replace annotation:', error);
                        }
                        
                        // Add SAM annotation to list immediately
                        console.log('📝 Adding SAM annotation to list immediately');
                        ensureAddAnnotation(samAnnotation);
                        
                    } else {
                        console.error('❌ SAM processing failed - keeping original');
                        ensureAddAnnotation(annotation);
                    }
                    
                    // Re-enable continuous interaction for SAM tools
                    setTimeout(() => {
                        maintainSAMToolState();
                    }, 100);
                    
                }).catch(error => {
                    console.error('❌ SAM processing error:', error);
                    ensureAddAnnotation(annotation);
                    
                    // Re-enable tool for retry
                    setTimeout(() => {
                        maintainSAMToolState();
                    }, 100);
                });
            } else {
                // Regular manual annotation - add immediately to list
                console.log('📝 Manual annotation - adding to list');
                ensureAddAnnotation(annotation);
            }
        });

        // Handle selection events (from backup)
        anno.on('selectAnnotation', function(annotation, element) {
            console.log('🎯 Annotation selected:', annotation.id);
            
            // If we're in SAM mode, maintain the tool after selection
            if (currentTool.startsWith('sam-')) {
                setTimeout(() => {
                    maintainSAMToolState();
                }, 50);
            }
            
            // Select the annotation
            ensureSelectAnnotation(annotation);
        });

        // Handle update events - this is when popup form fields are filled  
        anno.on('updateAnnotation', function(annotation) {
            // This is when we actually add the annotation to the list with proper comment/tags
            ensureAddAnnotation(annotation);
            
            // Maintain SAM tool state after update
            if (currentTool.startsWith('sam-')) {
                setTimeout(() => {
                    maintainSAMToolState();
                }, 50);
            }
        });

        // Handle delete events
        anno.on('deleteAnnotation', function(annotation) {
            console.log('🗑️ Annotation deleted:', annotation.id);
            removeAnnotation(annotation);
            
            // Maintain SAM tool state after delete
            if (currentTool.startsWith('sam-')) {
                setTimeout(() => {
                    maintainSAMToolState();
                }, 50);
            }
        });

        // Set initial drawing tool based on current selection
        setActiveTool(currentTool);
        
        console.log('✅ Annotations setup complete');
        
    } catch (error) {
        console.error('❌ Error setting up annotations:', error);
        throw error;
    }
}

/**
 * Setup tracking (from backup)
 */
function setupTracking() {
    // Start quadrilateral tracking if needed
    startQuadrilateralTracking();
}

/**
 * Setup dynamic image info updates (from backup)
 */
function setupDynamicImageInfoUpdates() {
    if (!viewer) return;
    
    // Update viewport info on zoom/pan
    viewer.addHandler('animation-finish', () => {
        if (window.currentImageInfo) {
            const newViewportBounds = getCurrentViewportBounds();
            if (newViewportBounds) {
                window.currentImageInfo.viewportBounds = newViewportBounds;
                console.log('🔄 Updated viewport bounds:', newViewportBounds);
            }
        }
    });
}

// Quadrilateral tracking functions (from backup)
function startQuadrilateralTracking() {
    if (!quadrilateralMode) return;
    
    polygonObserver = new MutationObserver(function(mutations) {
        if (!quadrilateralMode || currentTool !== 'quadrilateral') {
            return;
        }
        
        // Check for polygon handles (vertices)
        const handles = document.querySelectorAll('.a9s-selection .a9s-handle');
        const vertexCount = handles.length;
        
        console.log('Polygon vertices detected:', vertexCount);
        
        // Auto-complete when we have exactly 4 vertices
        if (vertexCount === 4) {
            console.log('4-sided polygon detected! Auto-completing...');
            setTimeout(() => {
                completeQuadrilateral();
            }, 200); // Small delay to ensure polygon is stable
        }
    });

    // Start observing the annotation layer for changes
    const annotationLayer = document.querySelector('svg.a9s-annotationlayer');
    if (annotationLayer) {
        polygonObserver.observe(annotationLayer, {
            childList: true,
            subtree: true,
            attributes: true
        });
    }
}

function stopQuadrilateralTracking() {
    if (polygonObserver) {
        polygonObserver.disconnect();
        polygonObserver = null;
    }
}

function completeQuadrilateral() {
    try {
        console.log('Completing quadrilateral...');
        
        // Method 1: Try clicking the first handle to close the polygon
        const firstHandle = document.querySelector('.a9s-selection .a9s-handle:first-child');
        if (firstHandle) {
            console.log('Clicking first handle to close quadrilateral');
            firstHandle.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
            
            // Enable mouse navigation after completion
            setTimeout(() => {
                viewer.setMouseNavEnabled(true);
                quadrilateralMode = false;
                polygonVertexCount = 0;
            }, 200);
            return;
        }
        
        // Method 2: Send Enter key to complete
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            bubbles: true,
            cancelable: true
        });
        document.dispatchEvent(enterEvent);
        
        // Method 3: Double-click the current selection to complete
        setTimeout(() => {
            const selectionElement = document.querySelector('.a9s-selection');
            if (selectionElement) {
                selectionElement.dispatchEvent(new MouseEvent('dblclick', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                }));
            }
            
            // Enable mouse navigation
            viewer.setMouseNavEnabled(true);
            quadrilateralMode = false;
            polygonVertexCount = 0;
        }, 100);

    } catch (error) {
        console.error('Error completing quadrilateral:', error);
        // Fallback: enable mouse navigation
        viewer.setMouseNavEnabled(true);
        quadrilateralMode = false;
        polygonVertexCount = 0;
    }
}


/**
 * Maintain SAM tool state for continuous interaction
 */
function maintainSAMToolState() {
    if (!anno || !currentTool.startsWith('sam-')) return;
    
    try {
        console.log('🔄 Maintaining SAM tool state for continuous interaction:', currentTool);
        
        // Re-enable drawing
        anno.setDrawingEnabled(true);
        
        // Re-set the current SAM tool to ensure it stays active
        switch(currentTool) {
            case 'sam-point':
                anno.setDrawingTool('point');
                console.log('♾️ Re-enabled SAM point tool for continuous use');
                break;
            case 'sam-rect':
                anno.setDrawingTool('rect');
                console.log('▭ Re-enabled SAM rectangle tool for continuous use');
                break;
        }
        
        // Ensure the tool button remains visually active
        const activePane = document.querySelector('.tab-pane.active');
        if (activePane) {
            // Remove active from all buttons first
            activePane.querySelectorAll('.tool-button').forEach(btn => {
                btn.classList.remove('active');
            });
            
            // Re-add active to current tool
            const currentButton = activePane.querySelector(`[data-tool="${currentTool}"]`);
            if (currentButton) {
                currentButton.classList.add('active');
                console.log('🔘 Re-activated tool button:', currentTool);
            }
        }
        
    } catch (error) {
        console.error('Error maintaining SAM tool state:', error);
    }
}

