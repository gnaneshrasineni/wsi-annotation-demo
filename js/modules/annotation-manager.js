/**
 * Annotation Management Module
 * 
 * Handles annotation operations:
 * - Creating and managing annotations
 * - Converting between coordinate systems
 * - SVG path creation
 * - Export/import functionality
 * - UI list management
 * - Tab-specific filtering
 */

// Global annotation storage - organized by tags instead of manual/SAM
var annotations = {};

// Current polarity setting  
var currentPolarity = 'positive';

/**
 * Extract coordinates from annotation object (from working backup)
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
                const coords = {
                    type: 'point',
                    x: parseFloat(shape.getAttribute('cx')),
                    y: parseFloat(shape.getAttribute('cy'))
                };
                console.log('🔍 Extracted point coordinates:', coords);
                return coords;
            } else if (shape.tagName === 'rect') {
                const coords = {
                    type: 'box',
                    x: parseFloat(shape.getAttribute('x')),
                    y: parseFloat(shape.getAttribute('y')),
                    width: parseFloat(shape.getAttribute('width')),
                    height: parseFloat(shape.getAttribute('height'))
                };
                console.log('🔍 Extracted box coordinates:', coords);
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
    
    console.error('❌ Could not extract coordinates from selector:', selector);
    return null;
}

/**
 * Create SVG path from WSI coordinates
 */
function createSVGPathFromWSICoordinates(coordinateRings) {
    if (!coordinateRings || !Array.isArray(coordinateRings) || coordinateRings.length === 0) {
        console.error('❌ Invalid coordinate rings for SVG path:', coordinateRings);
        return '';
    }
    
    const firstRing = coordinateRings[0];
    if (!Array.isArray(firstRing) || firstRing.length === 0) {
        console.error('❌ Invalid first coordinate ring:', firstRing);
        return '';
    }
    
    // Start path with first coordinate
    const firstCoord = firstRing[0];
    let pathData = `M ${firstCoord[0]},${firstCoord[1]}`;
    
    // Add remaining coordinates
    for (let i = 1; i < firstRing.length; i++) {
        const coord = firstRing[i];
        pathData += ` L ${coord[0]},${coord[1]}`;
    }
    
    // Close path
    pathData += ' Z';
    
    console.log('🎨 Created SVG path:', pathData.substring(0, 100) + '...');
    return `<svg><path d="${pathData}"></path></svg>`;
}

/**
 * Export annotation to standard format
 */
function convertAnnotationToExportFormat(annotation) {
    if (!annotation || !annotation.target || !annotation.target.selector) {
        console.warn('⚠️ Invalid annotation for export:', annotation);
        return null;
    }
    
    try {
        const selector = annotation.target.selector;
        let coordinates = [];
        
        if (selector.type === 'SvgSelector' && selector.value) {
            // Extract coordinates from SVG path
            const pathRegex = /[ML]\\s*([0-9.]+)[,\\s]+([0-9.]+)/g;
            let match;
            const points = [];
            
            while ((match = pathRegex.exec(selector.value)) !== null) {
                points.push([parseFloat(match[1]), parseFloat(match[2]), 0]);
            }
            
            coordinates = points;
        }
        
        const description = annotation.body?.[0]?.value || 'Annotation';
        
        return {
            _accessLevel: 2,
            _id: annotation.id,
            _modelType: 'annotation',
            _version: Date.now(),
            annotation: {
                description: description,
                elements: [
                    {
                        fillColor: 'rgba(0,0,0,0)',
                        lineColor: description.includes('SAM') ? 'rgb(0,255,255)' : 'rgb(0,0,0)',
                        lineWidth: 2,
                        rotation: 0,
                        normal: [0, 0, 1],
                        id: annotation.id,
                        type: 'polyline',
                        closed: true,
                        points: coordinates
                    }
                ]
            }
        };
    } catch (error) {
        console.error('❌ Error converting annotation for export:', error);
        return null;
    }
}

/**
 * Export single annotation
 */
function exportSingleAnnotation(annotation, category) {
    console.log('📤 Exporting single annotation:', annotation.id);
    
    try {
        const exportData = convertAnnotationToExportFormat(annotation);
        
        if (!exportData) {
            alert('Cannot export this annotation');
            return;
        }
        
        // Create filename with timestamp
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const filename = `annotation_${annotation.id.substring(0, 8)}_${dateStr}.json`;
        
        // Download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
            type: 'application/json' 
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('✅ Exported annotation:', filename);
        
    } catch (error) {
        console.error('❌ Export failed:', error);
        alert('Export failed: ' + error.message);
    }
}


/**
 * Create SVG path from points array
 */
function createSVGPathFromPoints(points) {
    if (!points || points.length === 0) return '';
    
    const firstPoint = points[0];
    let pathData = `M ${firstPoint[0]},${firstPoint[1]}`;
    
    for (let i = 1; i < points.length; i++) {
        const point = points[i];
        pathData += ` L ${point[0]},${point[1]}`;
    }
    
    pathData += ' Z';
    return `<svg><path d="${pathData}"></path></svg>`;
}

/**
 * Ensure annotation folder exists in UI (only in appropriate tab)
 */
function ensureAnnotationFolder(tag) {
    const folderId = `shared-${tag}-folder`;
    
    // Check if folder already exists
    const existingFolder = document.getElementById(folderId);
    if (existingFolder) {
        // Move existing folder to both tabs if needed
        moveSharedFolderToBothTabs(existingFolder);
        return;
    }
    
    // Create single shared folder structure
    const folder = document.createElement('div');
    folder.className = 'annotations-folder';
    folder.id = folderId;
    
    const header = document.createElement('div');
    header.className = 'folder-header';
    
    const icon = document.createElement('span');
    icon.className = 'folder-icon';
    icon.textContent = '📁';
    
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = tag;
    
    const count = document.createElement('span');
    count.className = 'annotation-count';
    count.id = `shared-${tag}-count`;
    count.textContent = '0';
    
    // Add delete folder button (red X)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'folder-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = `Delete all ${tag} annotations`;
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteFolderAndAnnotations(tag);
    });
    
    const list = document.createElement('div');
    list.className = 'annotations-list';
    list.id = `shared-${tag}-annotations`;
    
    header.appendChild(icon);
    header.appendChild(name);
    header.appendChild(count);
    header.appendChild(deleteBtn);
    folder.appendChild(header);
    folder.appendChild(list);
    
    // Add to current active tab
    const currentTab = getCurrentTab();
    const targetSection = document.getElementById(`${currentTab}-annotations-section`);
    if (targetSection) {
        targetSection.appendChild(folder);
        console.log(`📁 Created shared ${tag} folder in ${currentTab} tab`);
    }
}

function moveSharedFolderToBothTabs(folder) {
    const currentTab = getCurrentTab();
    const targetSection = document.getElementById(`${currentTab}-annotations-section`);
    
    // Move folder to current tab if not already there
    if (targetSection && !targetSection.contains(folder)) {
        targetSection.appendChild(folder);
        console.log(`📁 Moved shared folder to ${currentTab} tab`);
    }
}

/**
 * Delete entire folder and all its annotations
 */
function deleteFolderAndAnnotations(tag) {
    const folderName = tag;
    const annotationCount = annotations[tag] ? annotations[tag].length : 0;
    
    if (annotationCount === 0) {
        // Just remove empty folder
        const folder = document.getElementById(`shared-${tag}-folder`);
        if (folder) {
            folder.remove();
            console.log(`📁 Removed empty ${tag} folder`);
        }
        return;
    }
    
    // Confirm deletion of folder with annotations
    const confirmDelete = confirm(`Delete "${folderName}" folder and all ${annotationCount} annotations?`);
    if (!confirmDelete) return;
    
    // Remove all annotations from viewer
    if (annotations[tag] && anno) {
        annotations[tag].forEach(annotation => {
            try {
                anno.removeAnnotation(annotation.id);
            } catch (error) {
                console.warn('Could not remove annotation from viewer:', annotation.id);
            }
        });
    }
    
    // Remove from storage
    delete annotations[tag];
    
    // Remove folder from UI
    const folder = document.getElementById(`shared-${tag}-folder`);
    if (folder) {
        folder.remove();
        console.log(`🗑️ Deleted ${tag} folder and ${annotationCount} annotations`);
    }
}

/**
 * Update annotation count in UI
 */
function updateAnnotationCount(tab = null, tag = null) {
    if (tag) {
        // Update count for specific tag in shared folder
        const count = annotations[tag] ? annotations[tag].length : 0;
        const countEl = document.getElementById(`shared-${tag}-count`);
        if (countEl) {
            countEl.textContent = count;
            console.log(`📊 ${tag} annotations:`, count);
        }
    } else {
        // Update all counts in shared folders
        Object.keys(annotations).forEach(tag => {
            const count = annotations[tag].length;
            const countEl = document.getElementById(`shared-${tag}-count`);
            if (countEl) {
                countEl.textContent = count;
            }
        });
        console.log('📊 All annotation counts updated');
    }
}

/**
 * Extract annotation name from body (comment)
 * Based on W3C Web Annotation Data Model and Annotorious documentation
 */
function getAnnotationName(annotation) {
    console.log('💬 EXTRACTING COMMENT from annotation ID:', annotation.id);
    console.log('💬 Full annotation object:', JSON.stringify(annotation, null, 2));
    
    if (annotation.body && Array.isArray(annotation.body) && annotation.body.length > 0) {
        console.log('💬 Found annotation body with', annotation.body.length, 'items');
        
        // Look specifically for commenting purposes (W3C standard)
        for (let i = 0; i < annotation.body.length; i++) {
            const item = annotation.body[i];
            console.log(`💬 Examining body item ${i}:`);
            console.log(`   - Type: ${item.type || 'undefined'}`);
            console.log(`   - Purpose: ${item.purpose || 'undefined'}`);
            console.log(`   - Value: "${item.value || 'undefined'}"`);
            console.log(`   - Full item:`, JSON.stringify(item, null, 2));
            
            if (item.value && typeof item.value === 'string' && item.value.trim()) {
                // W3C Web Annotation standard purposes for comments
                if (item.purpose === 'commenting' || 
                    item.purpose === 'replying' ||
                    (item.type === 'TextualBody' && (item.purpose === 'commenting' || !item.purpose))) {
                    
                    const comment = item.value.trim();
                    console.log('✅ FOUND COMMENT:', `"${comment}"`);
                    console.log('✅ Comment extracted from purpose:', item.purpose || 'TextualBody without purpose');
                    return comment;
                }
            }
        }
        
        // Fallback: any body item with a value (less strict)
        for (let item of annotation.body) {
            if (item.value && typeof item.value === 'string' && item.value.trim()) {
                const fallbackComment = item.value.trim();
                console.log('⚠️ FALLBACK COMMENT found:', `"${fallbackComment}"`);
                console.log('⚠️ Using fallback from item with purpose:', item.purpose || 'no purpose');
                return fallbackComment;
            }
        }
        
        console.log('❌ No valid comment value found in any body item');
    } else {
        console.log('❌ No annotation body array found');
    }
    
    console.log('❌ FINAL RESULT: No comment found, using default "[Others]"');
    return '[Others]';
}

/**
 * Extract annotation tags
 * Based on W3C Web Annotation Data Model and Annotorious documentation
 */
function getAnnotationTags(annotation) {
    const tags = [];
    console.log('🏷️ EXTRACTING TAGS from annotation ID:', annotation.id);
    console.log('🏷️ Full annotation object:', JSON.stringify(annotation, null, 2));
    
    try {
        if (annotation.body && Array.isArray(annotation.body) && annotation.body.length > 0) {
            console.log('🏷️ Found annotation body with', annotation.body.length, 'items');
            
            // Look specifically for tagging purposes (W3C standard)
            for (let i = 0; i < annotation.body.length; i++) {
                const item = annotation.body[i];
                console.log(`🏷️ Examining body item ${i} for tags:`);
                console.log(`   - Type: ${item.type || 'undefined'}`);
                console.log(`   - Purpose: ${item.purpose || 'undefined'}`);
                console.log(`   - Value: "${item.value || 'undefined'}"`);
                console.log(`   - Full item:`, JSON.stringify(item, null, 2));
                
                if (item.value && typeof item.value === 'string' && item.value.trim()) {
                    // W3C Web Annotation standard purpose for tags
                    if (item.purpose === 'tagging') {
                        const tag = item.value.trim();
                        console.log('✅ FOUND TAG:', `"${tag}"`);
                        tags.push(tag);
                    }
                }
            }
            
            if (tags.length > 0) {
                console.log('✅ EXTRACTED TAGS:', tags);
                return tags;
            } else {
                console.log('❌ No tags with purpose="tagging" found');
            }
        } else {
            console.log('❌ No annotation body array found');
        }
    } catch (error) {
        console.error('❌ Error extracting tags:', error);
    }
    
    // Enhanced SAM detection with multiple fallback methods
    let defaultTag;
    try {
        if (isAnnotationFromSAMEnhanced(annotation)) {
            defaultTag = 'SAM';
            console.log('🔍 No explicit tags found, categorized as SAM based on enhanced detection');
        } else {
            defaultTag = 'Manual';
            console.log('🔍 No explicit tags found, categorized as Manual');
        }
    } catch (error) {
        console.error('❌ Error in SAM detection:', error);
        defaultTag = 'Others';
        console.log('🔄 Error in categorization, using fallback: Others');
    }
    
    tags.push(defaultTag);
    console.log('📋 FINAL TAGS for annotation:', tags);
    return tags;
}

/**
 * Enhanced SAM detection with multiple methods
 */
function isAnnotationFromSAMEnhanced(annotation) {
    try {
        // Method 1: Check annotation ID prefix
        if (annotation.id && annotation.id.startsWith('sam-')) {
            console.log('🤖 SAM detected via ID prefix');
            return true;
        }
        
        // Method 2: Check for samGenerated property
        if (annotation.samGenerated === true) {
            console.log('🤖 SAM detected via samGenerated property');
            return true;
        }
        
        // Method 3: Check for samTool property
        if (annotation.samTool && annotation.samTool.startsWith('sam-')) {
            console.log('🤖 SAM detected via samTool property');
            return true;
        }
        
        // Method 4: Check current tool (from global state)
        if (typeof currentTool !== 'undefined' && currentTool && currentTool.startsWith('sam-')) {
            console.log('🤖 SAM detected via current tool state');
            return true;
        }
        
        // Method 5: Check annotation body for SAM indicators
        if (annotation.body && Array.isArray(annotation.body)) {
            for (let item of annotation.body) {
                if (item.value && typeof item.value === 'string') {
                    if (item.value.toLowerCase().includes('sam') || 
                        item.value.toLowerCase().includes('segment anything')) {
                        console.log('🤖 SAM detected via body content');
                        return true;
                    }
                }
            }
        }
        
        console.log('👤 No SAM indicators found - classified as Manual');
        return false;
        
    } catch (error) {
        console.error('❌ Error in enhanced SAM detection:', error);
        return false;
    }
}

/**
 * Add annotation to appropriate category list
 */
function addAnnotationToList(annotation) {
    // Get tags to determine which folders to add to
    const tags = getAnnotationTags(annotation);
    const name = getAnnotationName(annotation);
    
    console.log(`📝 Adding annotation "${name}" to folders:`, tags);
    
    // Add to each tag folder
    tags.forEach(tag => {
        // Add to storage
        if (!annotations[tag]) {
            annotations[tag] = [];
        }
        annotations[tag].push(annotation);
        
        // Ensure UI folder exists
        ensureAnnotationFolder(tag);
        
        // Update UI list in shared folder (single location)
        const listElement = document.getElementById(`shared-${tag}-annotations`);
        if (listElement) {
            const item = createAnnotationItem(annotation, tag);
            listElement.appendChild(item);
            console.log(`✅ Added annotation to shared ${tag} UI list:`, annotation.id);
        } else {
            console.error(`❌ List element not found: shared-${tag}-annotations`);
        }
        
        // Update count in shared folder
        updateAnnotationCount(null, tag);
    });
    
    // Apply polarity styling
    applyPolarityStyle(annotation);
}

/**
 * Wrapper function for addAnnotationToList (for compatibility)
 * Make it explicitly global
 */
function addAnnotation(annotation) {
    addAnnotationToList(annotation);
}

// Ensure global accessibility
window.addAnnotation = addAnnotation;

/**
 * Wrapper function for selectAnnotationInViewer (for compatibility)
 */
function selectAnnotation(annotation) {
    selectAnnotationInViewer(annotation, null);
}

// Ensure global accessibility
window.selectAnnotation = selectAnnotation;

/**
 * Create HistomicsTK-style annotation list item element
 */
function createAnnotationItem(annotation, category) {
    const item = document.createElement('div');
    item.className = 'annotation-item';
    item.dataset.annotationId = annotation.id;
    
    // Visibility toggle (eye icon)
    const visibilityIcon = document.createElement('span');
    visibilityIcon.className = 'annotation-visibility';
    visibilityIcon.innerHTML = '👁️';
    visibilityIcon.title = 'Toggle visibility';
    visibilityIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        toggleAnnotationVisibility(annotation, visibilityIcon);
    });
    
    // Create main content container
    const contentDiv = document.createElement('div');
    contentDiv.className = 'annotation-content';
    
    // Use comment as annotation name (or [no name] if empty)
    let text = getAnnotationName(annotation);
    
    // Create text content element
    const textElement = document.createElement('span');
    textElement.className = 'annotation-text';
    textElement.textContent = text;
    contentDiv.appendChild(textElement);
    
    // Create HistomicsTK-style action buttons container
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'annotation-actions';
    
    // Settings button (⚙️)
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'annotation-action-btn annotation-settings-btn';
    settingsBtn.innerHTML = '⚙️';
    settingsBtn.title = 'Annotation settings';
    settingsBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        openAnnotationSettings(annotation, category);
    });
    
    // Delete button (×)
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'annotation-action-btn annotation-delete-btn';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Delete annotation';
    deleteBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        deleteAnnotation(annotation, category);
    });
    
    // Export/Download button (⬇)
    const exportBtn = document.createElement('button');
    exportBtn.className = 'annotation-action-btn annotation-export-btn';
    exportBtn.innerHTML = '⬇';
    exportBtn.title = 'Download annotation';
    exportBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        exportSingleAnnotation(annotation, category);
    });
    
    actionsDiv.appendChild(settingsBtn);
    actionsDiv.appendChild(deleteBtn);
    actionsDiv.appendChild(exportBtn);
    
    // Assemble the item
    item.appendChild(visibilityIcon);
    item.appendChild(contentDiv);
    item.appendChild(actionsDiv);
    
    // Click handler for selecting annotation
    item.addEventListener('click', function() {
        selectAnnotationInViewer(annotation, null);
    });
    
    return item;
}

/**
 * Select annotation in viewer
 */
function selectAnnotationInViewer(annotation, category) {
    console.log('🎯 Selecting annotation:', annotation.id);
    
    if (!anno) return;
    
    // Clear current selection
    anno.cancelSelected();
    
    // No need to switch tabs since annotations are shared across both tabs
    
    // Select annotation after brief delay
    setTimeout(() => {
        try {
            anno.selectAnnotation(annotation.id);
            highlightAnnotationInList(annotation);
            console.log('✅ Annotation selected:', annotation.id);
        } catch (error) {
            console.error('❌ Failed to select annotation:', error);
        }
    }, 100);
}

/**
 * Get current active tab
 */
function getCurrentTab() {
    const activeTab = document.querySelector('.tab-item.active');
    return activeTab ? activeTab.getAttribute('data-tab') : 'manual';
}

/**
 * Switch to specific tab
 */
function switchToTab(tabName) {
    const tabButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (tabButton && !tabButton.classList.contains('active')) {
        tabButton.click();
    }
}

/**
 * Highlight annotation in list
 */
function highlightAnnotationInList(annotation) {
    // Remove previous highlights
    document.querySelectorAll('.annotation-item.selected').forEach(item => {
        item.classList.remove('selected');
    });
    
    // Highlight selected annotation
    const annotationItem = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (annotationItem) {
        annotationItem.classList.add('selected');
    }
}

/**
 * Update annotation in list
 */
function updateAnnotationInList(annotation) {
    // Get tags and find which tag array this annotation is stored in
    const tags = getAnnotationTags(annotation);
    
    // Find and update in storage for each tag
    tags.forEach(tag => {
        if (annotations[tag]) {
            const index = annotations[tag].findIndex(ann => ann.id === annotation.id);
            if (index !== -1) {
                annotations[tag][index] = annotation;
            }
        }
    });
    
    // Update UI item text content
    const annotationItem = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (annotationItem) {
        const textElement = annotationItem.querySelector('.annotation-text');
        if (textElement) {
            let text = 'Annotation';
            if (annotation.body && annotation.body[0]) {
                text = annotation.body[0].value;
            }
            
            // No special treatment for SAM annotations - they should look the same
            // if (isAnnotationFromSAM(annotation)) {
            //     text = `🤖 ${text}`;
            //     annotationItem.classList.add('sam-annotation');
            // }
            
            // Add polarity indicator
            if (currentPolarity && currentPolarity !== 'positive') {
                text = `${currentPolarity === 'positive' ? '+' : '−'} ${text}`;
                annotationItem.classList.add('polarity-' + currentPolarity);
            } else if (currentPolarity === 'positive') {
                text = `+ ${text}`;
                annotationItem.classList.add('polarity-positive');
            }
            
            textElement.textContent = text;
        }
    }
    
    console.log('📝 Updated annotation in list:', annotation.id);
}

/**
 * Remove annotation from list
 */
function removeAnnotationFromList(annotation) {
    // Get tags and remove from each tag array  
    const tags = getAnnotationTags(annotation);
    
    tags.forEach(tag => {
        // Remove from storage
        if (annotations[tag]) {
            annotations[tag] = annotations[tag].filter(ann => ann.id !== annotation.id);
        }
        
        // Update count for this tag
        updateAnnotationCount(null, tag);
    });
    
    // Remove from UI
    const annotationItem = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (annotationItem) {
        annotationItem.remove();
    }
    
    console.log('🗑️ Removed annotation from list:', annotation.id);
}

/**
 * Delete annotation completely (HistomicsTK style - no confirmation popup)
 */
function deleteAnnotation(annotation, category) {
    // Remove from viewer
    try {
        if (anno) {
            anno.removeAnnotation(annotation.id);
        }
    } catch (error) {
        console.warn('⚠️ Could not remove annotation from viewer:', error);
    }
    
    // Get tags and remove from each tag array
    const tags = getAnnotationTags(annotation);
    
    tags.forEach(tag => {
        // Remove from storage
        if (annotations[tag]) {
            annotations[tag] = annotations[tag].filter(ann => ann.id !== annotation.id);
        }
        
        // Update count for this tag
        updateAnnotationCount(null, tag);
    });
    
    // Remove from UI
    const annotationItem = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
    if (annotationItem) {
        annotationItem.remove();
    }
    
    console.log('🗑️ Deleted annotation:', annotation.id);
}

/**
 * Check if annotation is from SAM
 */
function isAnnotationFromSAM(annotation) {
    // Check if annotation ID starts with 'sam-' to identify SAM annotations
    return annotation.id && annotation.id.startsWith('sam-');
}

/**
 * Get annotation display title
 */
function getAnnotationTitle(annotation) {
    if (annotation.body && annotation.body.length > 0 && annotation.body[0].value) {
        const value = annotation.body[0].value;
        // Return the same title format for all annotations
        return value.length > 20 ? value.substring(0, 20) + '...' : value;
    }
    return 'Annotation';
}

/**
 * Apply polarity styling to annotation
 */
function applyPolarityStyle(annotation) {
    // This would apply visual styling based on polarity
    // For now, just log the operation
    console.log('🎨 Applying polarity style to:', annotation.id, 'polarity:', currentPolarity);
}

/**
 * Toggle individual annotation visibility (HistomicsTK style)
 */
function toggleAnnotationVisibility(annotation, visibilityIcon) {
    // Toggle visibility state
    const isHidden = visibilityIcon.classList.contains('hidden');
    
    if (isHidden) {
        // Show annotation
        visibilityIcon.classList.remove('hidden');
        visibilityIcon.innerHTML = '👁️';
        if (anno) {
            try {
                // Add back to viewer if it's not already there
                const existingAnnotations = anno.getAnnotations();
                const exists = existingAnnotations.some(a => a.id === annotation.id);
                if (!exists) {
                    anno.addAnnotation(annotation);
                }
            } catch (error) {
                console.warn('Could not show annotation:', error);
            }
        }
        console.log('👁️ Showed annotation:', annotation.id);
    } else {
        // Hide annotation
        visibilityIcon.classList.add('hidden');
        visibilityIcon.innerHTML = '🙈';
        if (anno) {
            try {
                anno.removeAnnotation(annotation.id);
            } catch (error) {
                console.warn('Could not hide annotation:', error);
            }
        }
        console.log('🙈 Hidden annotation:', annotation.id);
    }
}

/**
 * Open annotation settings (placeholder for now)
 */
function openAnnotationSettings(annotation, category) {
    // For now, just allow editing the name
    const currentName = annotation.body && annotation.body[0] ? annotation.body[0].value : 'Interactive Segmentation...';
    const newName = prompt('Edit annotation name:', currentName);
    
    if (newName && newName !== currentName) {
        // Update annotation
        if (!annotation.body) annotation.body = [];
        if (!annotation.body[0]) annotation.body[0] = { type: 'TextualBody', purpose: 'commenting' };
        annotation.body[0].value = newName;
        
        // Update in list
        updateAnnotationInList(annotation);
        
        console.log('⚙️ Updated annotation name:', annotation.id, 'to:', newName);
    }
}

/**
 * Update annotation visibility based on current tab
 */
function updateAnnotationVisibility() {
    if (!anno) return;
    
    // Clear all visible annotations
    anno.clearAnnotations();
    
    // Show ALL annotations from shared storage (only visible ones)
    Object.keys(annotations).forEach(tag => {
        if (annotations[tag]) {
            annotations[tag].forEach(annotation => {
                // Check if annotation is marked as hidden
                const listItem = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
                const visibilityIcon = listItem?.querySelector('.annotation-visibility');
                const isHidden = visibilityIcon?.classList.contains('hidden');
                
                if (!isHidden) {
                    anno.addAnnotation(annotation);
                }
            });
        }
    });
    
    const totalAnnotations = Object.values(annotations).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`👁️ Updated annotation visibility: showing ${totalAnnotations} total annotations`);
}