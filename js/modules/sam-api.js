/**
 * SAM API Integration Module
 * 
 * Handles all SAM API interactions:
 * - Connection management
 * - Image capture and processing
 * - API communication
 * - Result processing
 * - Coordinate transformations (WSI ↔ Viewport)
 */

// SAM API state (make global for access from other modules)
var samConnected = false;
var samLiveMode = true; // Enable SAM live mode by default
var samApiUrl = 'http://localhost:3000/api/sam';

// Current image state for SAM processing
let currentImageData = null;
let currentWsiRegion = null;
let currentViewportBounds = null;

/**
 * Initialize SAM integration UI and event listeners
 */
function initializeSAMIntegration() {
    const connectButton = document.getElementById('sam-connect');
    const apiUrlInput = document.getElementById('sam-api-url');
    const statusElement = document.getElementById('sam-status');
    const thresholdSlider = document.getElementById('sam-threshold');
    const thresholdValue = document.getElementById('threshold-value');
    const liveModeCheckbox = document.getElementById('sam-live-mode');

    if (connectButton) {
        connectButton.addEventListener('click', connectToSAM);
    }
    
    if (apiUrlInput) {
        apiUrlInput.addEventListener('input', (e) => {
            samApiUrl = e.target.value;
        });
    }
    
    if (thresholdSlider && thresholdValue) {
        thresholdSlider.addEventListener('input', (e) => {
            thresholdValue.textContent = e.target.value;
        });
    }
    
    if (liveModeCheckbox) {
        liveModeCheckbox.addEventListener('change', (e) => {
            samLiveMode = e.target.checked;
            console.log('SAM live mode:', samLiveMode ? 'enabled' : 'disabled');
        });
    }
    
    console.log('SAM integration initialized');
}

/**
 * Connect to SAM API
 */
async function connectToSAM() {
    const connectButton = document.getElementById('sam-connect');
    const apiUrlInput = document.getElementById('sam-api-url');
    
    if (samConnected) {
        samConnected = false;
        updateSAMStatus('disconnected');
        if (connectButton) connectButton.textContent = 'Connect';
        console.log('Disconnected from SAM API');
        return;
    }

    try {
        if (apiUrlInput) {
            samApiUrl = apiUrlInput.value;
        }
        
        if (connectButton) {
            connectButton.disabled = true;
            connectButton.textContent = 'Connecting...';
        }

        // Test connection to SAM API
        const response = await fetch(`${samApiUrl}/version/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            samConnected = true;
            updateSAMStatus('connected');
            if (connectButton) connectButton.textContent = 'Disconnect';
            const versionText = await response.text();
            console.log('✅ Successfully connected to SAM API, version:', versionText);
        } else {
            throw new Error(`SAM API health check failed. Status: ${response.status} ${response.statusText}`);
        }
    } catch (error) {
        console.error('❌ Failed to connect to SAM API:', error);
        updateSAMStatus('disconnected');
        if (connectButton) connectButton.textContent = 'Connect';
        alert('Failed to connect to SAM API. Please check the URL and ensure the service is running.');
    } finally {
        if (connectButton) connectButton.disabled = false;
    }
}

/**
 * Update SAM connection status in UI
 */
function updateSAMStatus(status) {
    const statusElement = document.getElementById('sam-status');
    if (!statusElement) return;

    statusElement.className = `sam-status ${status}`;
    switch(status) {
        case 'connected':
            statusElement.textContent = 'Connected';
            statusElement.style.color = '#28a745';
            break;
        case 'processing':
            statusElement.textContent = 'Processing...';
            statusElement.style.color = '#ffc107';
            break;
        case 'disconnected':
        default:
            statusElement.textContent = 'Disconnected';
            statusElement.style.color = '#dc3545';
            break;
    }
}

/**
 * Capture current viewport as image data for SAM processing
 */
async function getCurrentImageData() {
    if (!viewer) {
        console.error('Viewer not available for image capture');
        return null;
    }
    
    try {
        
        const viewport = viewer.viewport;
        const container = viewer.canvas;
        
        // Get current viewport bounds with downsample factor
        const currentViewportBounds = getCurrentViewportBounds();
        const containerSize = viewport.getContainerSize();
        
        // Create canvas at original size (no resizing)
        const canvas = document.createElement('canvas');
        const targetWidth = Math.round(containerSize.x);
        const targetHeight = Math.round(containerSize.y);
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        console.log('📐 Image capture info:', {
            containerSize: containerSize,
            targetSize: { width: targetWidth, height: targetHeight },
            scale: 1.0
        });
        
        const ctx = canvas.getContext('2d');
        
        // Capture from OpenSeadragon canvas
        const viewerCanvas = viewer.canvas.querySelector('canvas');
        if (viewerCanvas) {
            console.log('✅ Capturing from OpenSeadragon canvas...');
            ctx.drawImage(viewerCanvas, 0, 0, canvas.width, canvas.height);
            
            // Convert to base64
            const base64Data = canvas.toDataURL('image/jpeg', 0.95).split(',')[1];
            
            console.log('✅ Successfully captured image data, length:', base64Data.length);
            
            return {
                imageData: base64Data,
                width: targetWidth,
                height: targetHeight,
                scale: 1.0,
                viewportBounds: currentViewportBounds,
                containerSize: containerSize
            };
        } else {
            throw new Error('Could not find OpenSeadragon canvas for image capture');
        }
        
    } catch (error) {
        console.error('❌ Failed to capture viewport image:', error);
        return null;
    }
}

/**
 * Process SAM prompt (point or rectangle)
 */
async function processSAMPrompt(promptAnnotation) {
    if (!samConnected) {
        throw new Error('SAM API not connected');
    }
    
    console.log('🚀 Processing SAM prompt:', promptAnnotation);
    
    try {
        // Get current viewport image data
        const imageInfo = await getCurrentImageData();
        if (!imageInfo) {
            throw new Error('Could not capture current image data');
        }
        
        // Store globally for coordinate transformations
        window.currentImageInfo = imageInfo;
        console.log('🖼️ Image info captured:', {
            dataLength: imageInfo.imageData.length,
            width: imageInfo.width,
            height: imageInfo.height,
            viewportBounds: imageInfo.viewportBounds
        });
        
        // Extract coordinates from prompt annotation
        const coords = extractCoordinatesFromAnnotation(promptAnnotation);
        if (!coords) {
            throw new Error('Could not extract coordinates from prompt');
        }
        
        console.log('📍 Extracted WSI coordinates:', coords);
        
        // Transform WSI coordinates to canvas coordinates for SAM API
        const canvasCoords = transformWSIToCanvasCoordinates(coords, imageInfo);
        console.log('📍 Canvas coordinates for SAM:', canvasCoords);
        
        // Prepare SAM API payload
        const samPayload = {
            type: 'vit_h',
            b64img: imageInfo.imageData,
            multimask_output: false
        };
        
        // Add coordinates based on tool type
        if (currentTool === 'sam-point') {
            samPayload.point_coords = [[canvasCoords.x, canvasCoords.y]];
            samPayload.point_labels = [1]; // 1 for foreground
            console.log('🎯 SAM point payload:', {
                point_coords: samPayload.point_coords,
                point_labels: samPayload.point_labels
            });
        } else if (currentTool === 'sam-rect') {
            samPayload.bbox = [
                canvasCoords.x, 
                canvasCoords.y,
                canvasCoords.x + canvasCoords.width, 
                canvasCoords.y + canvasCoords.height
            ];
            console.log('🎯 SAM bbox payload:', {
                bbox: samPayload.bbox
            });
        }
        
        console.log('🔥 Calling SAM API with payload:', {
            ...samPayload,
            b64img: `[${samPayload.b64img.length} chars]`
        });
        
        // Update status
        updateSAMStatus('processing');
        
        // Call SAM API (handle redirect properly)
        const response = await fetch(`${samApiUrl}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'accept': 'application/json'
            },
            body: JSON.stringify(samPayload),
            redirect: 'follow'  // Follow redirects automatically
        });
        
        console.log('📡 SAM API response status:', response.status, response.statusText);
        
        if (response.ok) {
            const samResult = await response.json();
            console.log('📥 SAM API response:', samResult);
            
            // Convert SAM result to annotation
            const samAnnotation = convertSAMResultToAnnotation(samResult, promptAnnotation, imageInfo);
            
            updateSAMStatus('connected');
            return samAnnotation;
            
        } else {
            const errorText = await response.text();
            console.error('❌ SAM API error:', response.status, errorText);
            updateSAMStatus('connected');
            throw new Error(`SAM API request failed: ${response.status} ${response.statusText}\\n${errorText}`);
        }
        
    } catch (error) {
        console.error('❌ SAM processing error:', error);
        updateSAMStatus('connected');
        throw error;
    }
}

/**
 * Convert SAM API result to annotation format
 */
function convertSAMResultToAnnotation(samResult, originalAnnotation, imageInfo) {
    if (!samResult) {
        console.warn('No SAM result to process');
        return null;
    }
    
    console.log('🔄 Converting SAM result to annotation:', samResult);
    
    try {
        let features = [];
        
        // Handle different SAM response formats
        if (Array.isArray(samResult)) {
            console.log('📋 Processing SAM array format with', samResult.length, 'masks');
            
            features = samResult.map(mask => {
                if (mask.geometry && mask.properties) {
                    return {
                        type: 'Feature',
                        geometry: mask.geometry,
                        properties: {
                            quality: mask.properties.quality || 0.5,
                            sam_model: mask.properties.sam_model || 'mobile-sam',
                            object_idx: mask.properties.object_idx || 0
                        }
                    };
                }
                return null;
            }).filter(f => f !== null);
        } else if (samResult.features && Array.isArray(samResult.features)) {
            features = samResult.features;
        } else {
            console.error('❌ Unrecognized SAM result format:', samResult);
            return null;
        }
        
        if (features.length === 0) {
            console.warn('⚠️ No valid features in SAM result');
            return null;
        }
        
        // Calculate areas and select smallest feature
        features.forEach(feature => {
            if (feature.geometry && feature.geometry.coordinates && feature.geometry.coordinates[0]) {
                const coords = feature.geometry.coordinates[0];
                feature.calculatedArea = calculatePolygonArea(coords);
            } else {
                feature.calculatedArea = Infinity;
            }
        });
        
        features.sort((a, b) => a.calculatedArea - b.calculatedArea);
        const bestFeature = features[0];
        
        console.log('📋 Selected smallest feature:', {
            quality: bestFeature.properties?.quality,
            area: bestFeature.calculatedArea?.toFixed(2),
            totalFeatures: features.length
        });
        
        if (!bestFeature.geometry || !bestFeature.geometry.coordinates) {
            console.error('❌ No geometry in selected feature');
            return null;
        }
        
        // SAM returns canvas coordinates relative to the viewport image
        // Transform these canvas coordinates back to WSI coordinates for display
        console.log('🎯 Transforming SAM canvas coordinates to WSI coordinates');
        console.log('🎯 Best feature geometry:', {
            type: bestFeature.geometry.type,
            coordinates: bestFeature.geometry.coordinates,
            coordinatesLength: bestFeature.geometry.coordinates?.length,
            firstCoordinate: bestFeature.geometry.coordinates?.[0]
        });
        
        const wsiCoordinatesForDisplay = transformCanvasToWSICoordinates(
            bestFeature.geometry.coordinates, 
            imageInfo
        );
        
        if (!wsiCoordinatesForDisplay) {
            console.error('❌ Failed to transform SAM coordinates to WSI');
            return null;
        }
        
        console.log('🎯 Final WSI coordinates for display:', {
            firstCoord: wsiCoordinatesForDisplay[0]?.[0],
            coordinateRange: wsiCoordinatesForDisplay[0] ? {
                x: `${Math.min(...wsiCoordinatesForDisplay[0].map(c => c[0]))} - ${Math.max(...wsiCoordinatesForDisplay[0].map(c => c[0]))}`,
                y: `${Math.min(...wsiCoordinatesForDisplay[0].map(c => c[1]))} - ${Math.max(...wsiCoordinatesForDisplay[0].map(c => c[1]))}`
            } : 'N/A'
        });
        
        // Create SVG path from WSI coordinates
        const svgPath = createSVGPathFromWSICoordinates(wsiCoordinatesForDisplay);
        
        // Create annotation in Annotorious format
        const samAnnotation = {
            ...originalAnnotation,
            id: 'sam-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            target: {
                ...originalAnnotation.target,
                selector: {
                    type: 'SvgSelector',
                    value: svgPath
                }
            },
            body: [
                {
                    type: 'TextualBody',
                    value: 'Annotation'
                }
            ]
        };
        
        console.log('✅ SAM annotation created:', samAnnotation.id);
        return samAnnotation;
        
    } catch (error) {
        console.error('❌ Error converting SAM result:', error);
        return null;
    }
}

/**
 * Calculate polygon area using shoelace formula
 */
function calculatePolygonArea(coordinates) {
    if (!coordinates || coordinates.length < 3) {
        return 0;
    }
    
    let area = 0;
    const n = coordinates.length;
    
    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += coordinates[i][0] * coordinates[j][1];
        area -= coordinates[j][0] * coordinates[i][1];
    }
    
    return Math.abs(area) / 2;
}

/**
 * Extract coordinates from annotation (from backup)
 */
function extractCoordinatesFromAnnotation(annotation) {
    console.log('🔍 Extracting coordinates from:', annotation);
    
    // Handle both selection objects and annotation objects
    let selector = null;
    
    if (annotation.target && annotation.target.selector) {
        // Standard annotation format
        selector = annotation.target.selector;
    } else if (annotation.selector) {
        // Selection object format
        selector = annotation.selector;
    } else {
        console.error('No selector found in annotation');
        return null;
    }
    
    console.log('🔍 Found selector:', selector);

    if (selector.type === 'SvgSelector') {
        // Parse SVG to get coordinates
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(selector.value, 'image/svg+xml');
        const shapes = svgDoc.querySelectorAll('circle, rect, polygon');
        
        console.log('🔍 Found shapes in SVG:', shapes.length);
        
        if (shapes.length > 0) {
            const shape = shapes[0];
            console.log('🔍 Shape type:', shape.tagName);
            
            if (shape.tagName === 'circle') {
                const normalizedX = parseFloat(shape.getAttribute('cx'));
                const normalizedY = parseFloat(shape.getAttribute('cy'));
                
                // Convert OpenSeadragon normalized coordinates (0-1) to WSI pixel coordinates
                const wsiCoords = convertNormalizedToWSICoordinates(normalizedX, normalizedY);
                
                const coords = {
                    type: 'point',
                    x: wsiCoords.x,
                    y: wsiCoords.y
                };
                console.log('🔍 Extracted point coordinates (normalized → WSI):', {
                    normalized: { x: normalizedX, y: normalizedY },
                    wsi: coords
                });
                return coords;
            } else if (shape.tagName === 'rect') {
                const normalizedX = parseFloat(shape.getAttribute('x'));
                const normalizedY = parseFloat(shape.getAttribute('y'));
                const normalizedWidth = parseFloat(shape.getAttribute('width'));
                const normalizedHeight = parseFloat(shape.getAttribute('height'));
                
                // Convert OpenSeadragon normalized coordinates to WSI pixel coordinates
                const topLeftWSI = convertNormalizedToWSICoordinates(normalizedX, normalizedY);
                const bottomRightWSI = convertNormalizedToWSICoordinates(
                    normalizedX + normalizedWidth, 
                    normalizedY + normalizedHeight
                );
                
                const coords = {
                    type: 'box',
                    x: topLeftWSI.x,
                    y: topLeftWSI.y,
                    width: bottomRightWSI.x - topLeftWSI.x,
                    height: bottomRightWSI.y - topLeftWSI.y
                };
                console.log('🔍 Extracted box coordinates (normalized → WSI):', {
                    normalized: { x: normalizedX, y: normalizedY, w: normalizedWidth, h: normalizedHeight },
                    wsi: coords
                });
                return coords;
            }
        } else {
            console.error('No shapes found in SVG selector');
        }
    } else if (selector.type === 'FragmentSelector') {
        // Parse FragmentSelector format: "xywh=pixel:15876.39453125,22354.78515625,0,0"
        console.log('🔍 Parsing FragmentSelector:', selector.value);
        
        const match = selector.value.match(/xywh=pixel:([\d.]+),([\d.]+),([\d.]+),([\d.]+)/);
        if (match) {
            const [, x, y, width, height] = match;
            const coords = {
                x: parseFloat(x),
                y: parseFloat(y),
                width: parseFloat(width),
                height: parseFloat(height)
            };
            
            // Determine if this is a point or box based on width/height
            if (coords.width === 0 && coords.height === 0) {
                coords.type = 'point';
                console.log('🔍 Extracted point coordinates from FragmentSelector:', coords);
            } else {
                coords.type = 'box';
                console.log('🔍 Extracted box coordinates from FragmentSelector:', coords);
            }
            
            return coords;
        } else {
            console.error('Could not parse FragmentSelector value:', selector.value);
        }
    } else {
        console.error('Unsupported selector type:', selector.type);
    }
    
    return null;
}

/**
 * Convert WSI coordinates to viewport coordinates (from InteractiveSegmentation.py)
 * Based on wsi_to_viewport_coords function (lines 94-106)
 */
function wsiToViewportCoords(wsiPoint, wsiRegion, viewportShape) {
    const { x: wsiX, y: wsiY } = wsiPoint;
    
    // Calculate relative position within the ROI
    const relX = (wsiX - wsiRegion.left) / wsiRegion.width;
    const relY = (wsiY - wsiRegion.top) / wsiRegion.height;
    
    // Convert to viewport coordinates
    const viewportX = Math.floor(relX * viewportShape.width);
    const viewportY = Math.floor(relY * viewportShape.height);
    
    return { x: viewportX, y: viewportY };
}

/**
 * Convert viewport coordinates back to WSI coordinates (from InteractiveSegmentation.py)
 * Based on viewport_to_wsi_coords function (lines 108-126)
 */
function viewportToWsiCoords(viewportCoords, wsiRegion, viewportShape) {
    if (!viewportCoords || viewportCoords.length === 0) {
        return [];
    }
    
    const widthInv = 1.0 / viewportShape.width;
    const heightInv = 1.0 / viewportShape.height;
    const { left: wsiLeft, top: wsiTop, width: wsiWidth, height: wsiHeight } = wsiRegion;
    
    return viewportCoords.map(coord => {
        const [vpX, vpY] = coord;
        return [
            wsiLeft + (vpX * widthInv * wsiWidth),
            wsiTop + (vpY * heightInv * wsiHeight)
        ];
    });
}

/**
 * Transform WSI coordinates to canvas coordinates for SAM API
 */
function transformWSIToCanvasCoordinates(coords, imageInfo) {
    console.log('🔄 Transforming WSI to canvas coordinates:', coords);
    console.log('🔄 Image info:', imageInfo);
    
    // Get current viewport bounds
    const viewportBounds = imageInfo.viewportBounds;
    const viewportShape = { width: imageInfo.width, height: imageInfo.height };
    
    // Create WSI region from viewport bounds
    const wsiRegion = {
        left: viewportBounds.x,
        top: viewportBounds.y,
        width: viewportBounds.width,
        height: viewportBounds.height
    };
    
    if (coords.type === 'point') {
        const canvasCoords = wsiToViewportCoords(
            { x: coords.x, y: coords.y }, 
            wsiRegion, 
            viewportShape
        );
        console.log('🔄 Point transformation result:', canvasCoords);
        return canvasCoords;
    } else if (coords.type === 'box') {
        const topLeft = wsiToViewportCoords(
            { x: coords.x, y: coords.y }, 
            wsiRegion, 
            viewportShape
        );
        const bottomRight = wsiToViewportCoords(
            { x: coords.x + coords.width, y: coords.y + coords.height }, 
            wsiRegion, 
            viewportShape
        );
        
        const canvasCoords = {
            x: topLeft.x,
            y: topLeft.y,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y
        };
        console.log('🔄 Box transformation result:', canvasCoords);
        return canvasCoords;
    }
    
    return null;
}

/**
 * Transform canvas coordinates back to WSI coordinates
 */
function transformCanvasToWSICoordinates(coordinates, imageInfo) {
    console.log('🔄 Transforming canvas to WSI coordinates:', coordinates);
    
    if (!coordinates || !coordinates[0]) {
        console.error('❌ No coordinates to transform');
        return null;
    }
    
    // Get current viewport bounds
    const viewportBounds = imageInfo.viewportBounds;
    const viewportShape = { width: imageInfo.width, height: imageInfo.height };
    
    // Create WSI region from viewport bounds
    const wsiRegion = {
        left: viewportBounds.x,
        top: viewportBounds.y,
        width: viewportBounds.width,
        height: viewportBounds.height
    };
    
    console.log('🔄 Using WSI region:', wsiRegion);
    console.log('🔄 Using viewport shape:', viewportShape);
    
    // Transform polygon coordinates
    const wsiCoords = viewportToWsiCoords(coordinates[0], wsiRegion, viewportShape);
    
    console.log('🔄 Canvas to WSI transformation result:', wsiCoords);
    return [wsiCoords];
}

/**
 * Create SVG path from WSI coordinates
 */
function createSVGPathFromWSICoordinates(wsiCoordinates) {
    if (!wsiCoordinates || !wsiCoordinates[0] || wsiCoordinates[0].length === 0) {
        console.error('❌ No WSI coordinates to create SVG path');
        return '';
    }
    
    const coords = wsiCoordinates[0];
    let pathData = `<svg><polygon points="`;
    
    for (let i = 0; i < coords.length; i++) {
        if (i > 0) pathData += ' ';
        pathData += `${coords[i][0]},${coords[i][1]}`;
    }
    
    pathData += `" /></svg>`;
    
    console.log('🔄 Created SVG path:', pathData);
    return pathData;
}

/**
 * Convert OpenSeadragon normalized coordinates (0-1 range) to WSI pixel coordinates
 */
function convertNormalizedToWSICoordinates(normalizedX, normalizedY) {
    if (!viewer) {
        console.error('❌ Viewer not available for coordinate conversion');
        return { x: normalizedX, y: normalizedY };
    }
    
    try {
        // Create OpenSeadragon Point from normalized coordinates
        const normalizedPoint = new OpenSeadragon.Point(normalizedX, normalizedY);
        
        // Convert from viewport coordinates to image coordinates
        const imagePoint = viewer.viewport.viewportToImageCoordinates(normalizedPoint);
        
        console.log('🔄 Coordinate conversion:', {
            normalized: { x: normalizedX, y: normalizedY },
            wsi: { x: Math.round(imagePoint.x), y: Math.round(imagePoint.y) }
        });
        
        return {
            x: Math.round(imagePoint.x),
            y: Math.round(imagePoint.y)
        };
    } catch (error) {
        console.error('❌ Error converting normalized coordinates:', error);
        return { x: normalizedX, y: normalizedY };
    }
}