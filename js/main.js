/**
 * Main initialization file - exactly matching backup viewer.js
 */

// Initialize file input (from backup)
function initializeFileInput() {
    const fileInput = document.getElementById('file-input');
    const browseButton = document.getElementById('browse-button');
    const fileInfo = document.getElementById('file-info');

    if (!fileInput || !browseButton) {
        console.error('File input elements not found');
        return;
    }

    browseButton.addEventListener('click', function(e) {
        e.preventDefault();
        console.log('Browse button clicked');
        fileInput.click();
    });

    fileInput.addEventListener('change', function(event) {
        console.log('File input changed');
        const file = event.target.files[0];
        if (file) {
            console.log('File selected:', file.name);
            loadTiffFile(file);
            if (fileInfo) {
                fileInfo.textContent = `Selected: ${file.name}`;
            }
        }
    });

    // Drag and drop functionality
    const dropZone = document.getElementById('wsi-canvas');
    
    if (dropZone) {
        dropZone.addEventListener('dragover', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });

        dropZone.addEventListener('dragleave', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });

        dropZone.addEventListener('drop', function(e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                const file = files[0];
                console.log('File dropped:', file.name, 'Type:', file.type);
                
                const fileName = file.name.toLowerCase();
                const validExtensions = ['.tiff', '.tif', '.svs'];
                const isValidFile = validExtensions.some(ext => fileName.endsWith(ext)) || 
                                  file.type === 'image/tiff' || 
                                  file.type === 'image/tif';
                
                if (isValidFile) {
                    loadTiffFile(file);
                    if (fileInfo) {
                        fileInfo.textContent = `Selected: ${file.name}`;
                    }
                } else {
                    alert('Please select a valid TIFF or SVS file.\nSupported formats: .tiff, .tif, .svs');
                }
            }
        });
    }

    console.log('File input initialized successfully');
}

// Initialize tabs (from backup)
function initializeTabs() {
    const tabItems = document.querySelectorAll('.tab-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const leftArrow = document.getElementById('tab-arrow-left');
    const rightArrow = document.getElementById('tab-arrow-right');

    tabItems.forEach((item, index) => {
        item.addEventListener('click', function() {
            const targetTab = this.dataset.tab;
            
            tabItems.forEach(t => t.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            
            this.classList.add('active');
            document.getElementById(targetTab + '-pane').classList.add('active');
            
            currentTabIndex = index;
            currentTab = targetTab;
            updateTabNavigation();
            
            // Apply default configuration for the tab
            applyTabDefaults(targetTab);
            
            // Update annotation visibility
            updateAnnotationVisibility();
        });
    });

    if (leftArrow) {
        leftArrow.addEventListener('click', () => {
            if (currentTabIndex > 0) {
                tabItems[currentTabIndex - 1].click();
            }
        });
    }

    if (rightArrow) {
        rightArrow.addEventListener('click', () => {
            if (currentTabIndex < tabItems.length - 1) {
                tabItems[currentTabIndex + 1].click();
            }
        });
    }

    const toolButtons = document.querySelectorAll('.tool-button');
    toolButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tool = this.dataset.tool;
            setActiveTool(tool);
        });
    });

    const polarityButtons = document.querySelectorAll('.polarity-button');
    polarityButtons.forEach(button => {
        button.addEventListener('click', function() {
            const polarity = this.dataset.polarity;
            togglePolarity(polarity, this);
        });
    });

    updateTabNavigation();
    
    // Set initial tab and apply defaults
    currentTab = 'manual';
    applyTabDefaults('manual');
    updateAnnotationVisibility();
}

function applyTabDefaults(tabName) {
    const defaults = tabDefaults[tabName];
    if (!defaults) return;
    
    // Set default tool
    if (defaults.tool) {
        setActiveTool(defaults.tool);
    }
    
    // Set default polarity
    const tabPane = document.getElementById(tabName + '-pane');
    if (tabPane) {
        const polarityButtons = tabPane.querySelectorAll('.polarity-button');
        
        // Reset all polarity buttons
        polarityButtons.forEach(btn => btn.classList.remove('active'));
        currentPolarity = null;
        
        // Set default polarity if specified
        if (defaults.polarity) {
            const targetPolarityBtn = tabPane.querySelector(`[data-polarity="${defaults.polarity}"]`);
            if (targetPolarityBtn) {
                targetPolarityBtn.classList.add('active');
                currentPolarity = defaults.polarity;
            }
        }
    }
}

function updateAnnotationVisibility() {
    if (!anno) return;
    
    // Clear all visible annotations
    anno.clearAnnotations();
    
    // Show annotations for current tab
    const category = currentTab;
    if (annotations[category]) {
        annotations[category].forEach(annotation => {
            // Check if annotation is marked as hidden
            const listItem = document.querySelector(`[data-annotation-id="${annotation.id}"]`);
            const visibilityIcon = listItem?.querySelector('.annotation-visibility');
            const isHidden = visibilityIcon?.classList.contains('hidden');
            
            if (!isHidden) {
                anno.addAnnotation(annotation);
            }
        });
    }
}

function selectFirstToolInTab(tabName) {
    // This function is now replaced by applyTabDefaults
    applyTabDefaults(tabName);
}

function updateTabNavigation() {
    const tabNav = document.getElementById('tab-nav');
    const leftArrow = document.getElementById('tab-arrow-left');
    const rightArrow = document.getElementById('tab-arrow-right');
    const tabItems = document.querySelectorAll('.tab-item');

    if (!tabNav || !leftArrow || !rightArrow) return;

    // With only 2 tabs, we don't need scrolling navigation
    tabNav.style.transform = 'translateX(0)';
    
    // Disable both arrows since we only have 2 tabs
    leftArrow.disabled = true;
    rightArrow.disabled = true;
    leftArrow.style.opacity = '0.3';
    rightArrow.style.opacity = '0.3';
}

// Keyboard shortcuts setup (from backup)
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', function(event) {
        // Only handle shortcuts when not in an input field
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
            return;
        }
        
        switch(event.key) {
            case 'c':
                setActiveTool('circle');
                event.preventDefault();
                break;
            case 'r':
                setActiveTool('rect');
                event.preventDefault();
                break;
            case 'p':
                setActiveTool('point');
                event.preventDefault();
                break;
            case 'f':
                setActiveTool('freehand');
                event.preventDefault();
                break;
            case 'q':
                setActiveTool('quadrilateral');
                event.preventDefault();
                break;
            case 'Delete':
            case 'Backspace':
                // Delete selected annotation
                const selected = anno?.getSelected();
                if (selected && selected.length > 0) {
                    anno.removeAnnotation(selected[0]);
                    event.preventDefault();
                }
                break;
        }
    });
}

// Context menu setup (from backup)
function setupContextMenu() {
    // Disable default context menu on viewer
    const viewer_element = document.getElementById('wsi-canvas');
    if (viewer_element) {
        viewer_element.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            return false;
        });
    }
}

// Initialize everything (exactly from backup)
document.addEventListener('DOMContentLoaded', function() {
    // Enable GeoTIFF support if available
    if (typeof GeoTIFFTileSource !== 'undefined') {
        console.log('🌍 Enabling GeoTIFF tile source support');
        GeoTIFFTileSource.enableGeoTIFFTileSource(OpenSeadragon);
    }
    
    initializeFileInput();
    initializeTabs();
    setupKeyboardShortcuts();
    setupContextMenu();
    initializeSAMIntegration();
    
    console.log('✅ Application initialized');
});