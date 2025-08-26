/**
 * Coordinate Transformation Module
 * 
 * Handles transformations between different coordinate systems:
 * - WSI pixel coordinates (18000, 22000 range)  
 * - Canvas coordinates (relative to viewport image)
 * - OpenSeadragon normalized coordinates (0-1 range)
 */

/**
 * Transform coordinates from WSI/viewport space to canvas space using QuPath approach (from backup)
 */
function transformCoordinatesToCanvasQuPathStyle(coords, imageInfo) {
    // Transform coordinates properly accounting for OpenSeadragon vs QuPath differences
    // OpenSeadragon: normalized viewport coordinates (0-1) 
    // QuPath: pixel coordinates from full-resolution image
    
    if (!viewer || !imageInfo) {
        console.error('Missing viewer or image info for coordinate transformation');
        return coords;
    }
    
    const viewport = viewer.viewport;
    const currentImageInfo = window.currentImageInfo || imageInfo;
    const viewportBounds = currentImageInfo.viewportBounds;
    
    console.log('🔄 Coordinate transformation (OpenSeadragon → Canvas):', {
        inputCoords: coords,
        coordType: 'Detecting coordinate type...',
        canvasSize: { width: imageInfo.width, height: imageInfo.height }
    });
    
    // Step 1: Detect coordinate type and convert to image pixel coordinates
    let imagePixelCoords;
    
    if (coords.x >= 0 && coords.x <= 1 && coords.y >= 0 && coords.y <= 1) {
        // Input is OpenSeadragon normalized viewport coordinates (0-1)
        console.log('   📍 Detected: OpenSeadragon normalized viewport coordinates');
        
        // Convert viewport coordinates to image coordinates using OpenSeadragon method
        const viewportPoint = new OpenSeadragon.Point(coords.x, coords.y);
        const imagePoint = viewport.viewportToImageCoordinates(viewportPoint);
        
        imagePixelCoords = {
            x: imagePoint.x,
            y: imagePoint.y
        };
        
        console.log('   📍 Converted to image pixels:', imagePixelCoords);
        
    } else {
        // Input is already in image pixel coordinates (QuPath style)
        console.log('   📍 Detected: Image pixel coordinates (QuPath style)');
        imagePixelCoords = { x: coords.x, y: coords.y };
    }
    
    // Step 2: Now apply QuPath-style canvas transformation
    // The captured canvas represents a scaled-down version of the current viewport
    // We need to map from full image coordinates to canvas coordinates
    
    if (!viewportBounds || !viewportBounds.downsample) {
        console.error('Missing viewport bounds or downsample factor');
        return coords;
    }
    
    // QuPath transformation: canvasCoord = (imageCoord - offset) / downsample
    const downsample = viewportBounds.downsample;
    const xOffset = viewportBounds.x;
    const yOffset = viewportBounds.y;
    
    console.log('   📍 QuPath transformation parameters:', {
        downsample: downsample,
        offset: { x: xOffset, y: yOffset },
        imagePixelCoords: imagePixelCoords
    });
    
    let transformedCoords = {
        x: Math.floor((imagePixelCoords.x - xOffset) / downsample),
        y: Math.floor((imagePixelCoords.y - yOffset) / downsample)
    };
    
    // Handle width/height for box coordinates
    if (coords.width !== undefined) {
        transformedCoords.width = Math.floor(coords.width / downsample);
    }
    if (coords.height !== undefined) {
        transformedCoords.height = Math.floor(coords.height / downsample);
    }
    
    // Ensure within canvas bounds
    transformedCoords.x = Math.max(0, Math.min(imageInfo.width - 1, transformedCoords.x));
    transformedCoords.y = Math.max(0, Math.min(imageInfo.height - 1, transformedCoords.y));
    
    if (transformedCoords.width !== undefined) {
        transformedCoords.width = Math.max(1, Math.min(imageInfo.width - transformedCoords.x, transformedCoords.width));
    }
    if (transformedCoords.height !== undefined) {
        transformedCoords.height = Math.max(1, Math.min(imageInfo.height - transformedCoords.y, transformedCoords.height));
    }
    
    console.log('✅ QuPath transformation result:', transformedCoords);
    return transformedCoords;
}

/**
 * Legacy function wrapper for compatibility
 */
function transformWSIToCanvasCoordinates(coords, imageInfo) {
    return transformCoordinatesToCanvasQuPathStyle(coords, imageInfo);
}

/**
 * Transform canvas coordinates back to WSI coordinates using QuPath approach (from backup)
 */
function transformCanvasCoordinatesToWSIQuPathStyle(canvasCoordinates, imageInfo) {
    // Transform coordinates from canvas space back to WSI space using QuPath approach
    // This follows the reverse of Utils.getCoordinates() and applies AffineTransform logic
    
    console.log('🔄 QuPath-style reverse transformation (Canvas → WSI):', {
        canvasCoordinates: canvasCoordinates,
        coordinatesType: typeof canvasCoordinates,
        isArray: Array.isArray(canvasCoordinates),
        length: canvasCoordinates?.length,
        firstElement: canvasCoordinates?.[0]
    });
    
    if (!canvasCoordinates || !Array.isArray(canvasCoordinates)) {
        console.error('❌ Invalid canvas coordinates:', canvasCoordinates);
        return null;
    }
    
    const viewport = viewer.viewport;
    const currentImageInfo = window.currentImageInfo || imageInfo;
    const viewportBounds = currentImageInfo.viewportBounds;
    
    if (!viewportBounds || !viewportBounds.downsample) {
        console.error('Missing viewport bounds or downsample factor for reverse transformation');
        return null;
    }
    
    // QuPath reverse transformation: canvasCoord * downsample + offset
    const downsample = viewportBounds.downsample;
    const xOffset = viewportBounds.x;
    const yOffset = viewportBounds.y;
    
    console.log('🔄 QuPath reverse transformation parameters:', {
        downsample: downsample,
        offset: { x: xOffset, y: yOffset },
        viewportBounds: viewportBounds
    });
    
    function transformCoordinate(coord) {
        if (!Array.isArray(coord) || coord.length < 2) {
            console.error('❌ Invalid coordinate:', coord);
            return [0, 0];
        }
        
        const [canvasX, canvasY] = coord;
        
        // QuPath reverse: imageCoord = canvasCoord * downsample + offset  
        const imageX = canvasX * downsample + xOffset;
        const imageY = canvasY * downsample + yOffset;
        
        console.log('🔄 Coordinate reverse transformation:', {
            canvas: [canvasX, canvasY],
            wsi: [imageX, imageY]
        });
        
        return [imageX, imageY];
    }

    try {
        // Handle nested coordinate arrays (polygon structures)
        if (canvasCoordinates.length > 0 && Array.isArray(canvasCoordinates[0])) {
            if (Array.isArray(canvasCoordinates[0][0])) {
                // Triple nested: [[[x,y], [x,y], ...]]
                console.log('🔄 Processing triple-nested coordinates');
                return canvasCoordinates.map(ring =>
                    ring.map(coord => transformCoordinate(coord))
                );
            } else {
                // Double nested: [[x,y], [x,y], ...]
                console.log('🔄 Processing double-nested coordinates');
                return [canvasCoordinates.map(coord => transformCoordinate(coord))];
            }
        } else {
            // Single level: [x,y] or flat coordinates
            console.log('🔄 Processing single-level coordinates');
            return [transformCoordinate(canvasCoordinates)];
        }
    } catch (error) {
        console.error('❌ Error in QuPath reverse coordinate transformation:', error);
        return null;
    }
}

/**
 * Legacy function wrapper for compatibility
 */
function transformCanvasToWSICoordinates(canvasCoordinates, imageInfo) {
    return transformCanvasCoordinatesToWSIQuPathStyle(canvasCoordinates, imageInfo);
}

/**
 * Get current viewport bounds with downsample factor (QuPath style)
 * @returns {Object} Viewport bounds with downsample factor
 */
function getCurrentViewportBounds() {
    if (!viewer) {
        console.error('Viewer not available for viewport bounds');
        return null;
    }

    const viewport = viewer.viewport;
    
    // Get visible viewport bounds in viewport coordinates (0-1 normalized)
    const viewportBounds = viewport.getBounds(); // false = viewport coordinates (normalized)    

    var topLeftViewport = new OpenSeadragon.Point(viewportBounds.x, viewportBounds.y);
    var topLeftImage = viewer.viewport.viewportToImageCoordinates(topLeftViewport);
    
    // Bottom-right corner  
    var bottomRightViewport = new OpenSeadragon.Point(
        viewportBounds.x + viewportBounds.width, 
        viewportBounds.y + viewportBounds.height
    );
    var bottomRightImage = viewer.viewport.viewportToImageCoordinates(bottomRightViewport);
    
    // Calculate downsample factor based on current zoom
    const currentZoom = viewport.getZoom(true); // true = image coordinates
    const downsample = 1.0 / currentZoom;
    
    // Return bounds with start (x, y) in WSI coordinates and proper width/height
    const bounds = {
        x: Math.round(topLeftImage.x),                                    // Start X in WSI pixel coordinates
        y: Math.round(topLeftImage.y),                                    // Start Y in WSI pixel coordinates  
        width: Math.round(bottomRightImage.x - topLeftImage.x),           // Width in WSI pixels
        height: Math.round(bottomRightImage.y - topLeftImage.y),          // Height in WSI pixels
    };

    console.log('📍 Current viewport bounds (WSI coordinates via proper conversion):', {
        viewportBounds: { x: topLeftImage.x, y: topLeftImage.y, w: bounds.width, h: bounds.height },
    });
    
    return bounds;
}

/**
 * Debug coordinate transformation pipeline (from backup)
 */
function debugCoordinatePipeline(userClickPoint, imageInfo) {
    // Comprehensive debugging of the entire coordinate transformation pipeline
    console.log('\n🔬 === COORDINATE TRANSFORMATION PIPELINE DEBUG ===');
    
    // Step 1: Analyze user input
    console.log('📍 1. USER INPUT:');
    console.log('   User clicked at:', userClickPoint);
    
    // Step 2: Analyze current viewport state
    const viewport = viewer.viewport;
    const currentBounds = viewport.getBounds();
    const zoom = viewport.getZoom();
    const containerSize = viewport.getContainerSize();
    
    console.log('📍 2. VIEWPORT STATE:');
    console.log('   Viewport bounds (normalized):', currentBounds);
    console.log('   Zoom level:', zoom);
    console.log('   Container size (pixels):', containerSize);
    
    // Step 3: Convert user click to WSI coordinates (if it's in viewport coords)
    let wsiUserClick;
    if (userClickPoint.x >= 0 && userClickPoint.x <= 1 && userClickPoint.y >= 0 && userClickPoint.y <= 1) {
        // User click is in normalized viewport coordinates
        wsiUserClick = {
            x: userClickPoint.x * wsi_width,
            y: userClickPoint.y * wsi_height
        };
        console.log('📍 3. USER CLICK → WSI:');
        console.log('   Normalized click → WSI coordinates:', wsiUserClick);
    } else {
        // User click is already in WSI coordinates
        wsiUserClick = userClickPoint;
        console.log('📍 3. USER CLICK (already WSI):', wsiUserClick);
    }
    
    // Step 4: Transform WSI coordinates to canvas coordinates for SAM API
    const canvasCoords = transformCoordinatesToCanvasQuPathStyle(
        { type: 'point', x: wsiUserClick.x, y: wsiUserClick.y }, 
        imageInfo
    );
    
    console.log('📍 4. WSI → CANVAS (for SAM API):');
    console.log('   WSI coordinates:', { x: wsiUserClick.x, y: wsiUserClick.y });
    console.log('   Canvas coordinates:', canvasCoords);
    console.log('   Canvas size:', { width: imageInfo.width, height: imageInfo.height });
    console.log('   Downsample factor:', imageInfo.viewportBounds?.downsample);
    
    // Step 5: Simulate SAM response and reverse transformation
    console.log('📍 5. SIMULATION - SAM RESPONSE → WSI:');
    console.log('   Simulating SAM returns canvas coords:', [canvasCoords.x, canvasCoords.y]);
    
    const reversedWSI = transformCanvasCoordinatesToWSIQuPathStyle(
        [[[canvasCoords.x, canvasCoords.y]]],
        imageInfo
    );
    
    console.log('   Reverse transformation result:', reversedWSI);
    
    // Step 6: Convert final WSI coordinates back to viewport coordinates for display
    if (reversedWSI && reversedWSI[0] && reversedWSI[0][0]) {
        const finalWSI = reversedWSI[0][0];
        const viewportForDisplay = {
            x: finalWSI[0] / wsi_width,
            y: finalWSI[1] / wsi_height
        };
        
        console.log('📍 6. FINAL WSI → VIEWPORT (for display):');
        console.log('   Final WSI coordinates:', finalWSI);
        console.log('   Viewport coordinates for display:', viewportForDisplay);
        
        // Check if it's within current viewport bounds
        const withinViewport = 
            viewportForDisplay.x >= currentBounds.x && 
            viewportForDisplay.x <= (currentBounds.x + currentBounds.width) &&
            viewportForDisplay.y >= currentBounds.y && 
            viewportForDisplay.y <= (currentBounds.y + currentBounds.height);
            
        console.log('   Within current viewport?', withinViewport ? '✅ YES' : '❌ NO');
        
        if (!withinViewport) {
            console.log('   🚨 ANNOTATION WILL NOT BE VISIBLE - outside viewport!');
            console.log('   Current viewport bounds:', currentBounds);
            console.log('   Annotation viewport coords:', viewportForDisplay);
        }
    }
    
    console.log('🔬 === END COORDINATE PIPELINE DEBUG ===\n');
}

