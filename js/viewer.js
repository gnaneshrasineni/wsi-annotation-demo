var viewer = OpenSeadragon({
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
    tileSources: {
        Image: {
            xmlns: "http://schemas.microsoft.com/deepzoom/2008",
            Url: "./A05_files/",
            Format: "jpeg",
            Overlap: "0",
            TileSize: "256",
            Size: {
                Height: 42625,
                Width: 51553
            }
        },
        overlays: [],
    },
});
viewer.innerTracker.keyHandler = null;

var anno = OpenSeadragon.Annotorious(viewer);
Annotorious.SelectorPack(anno);

const toolbar = new Annotorious.Toolbar(anno, document.getElementById('annotation-toolbar'));
viewer.addControl(document.getElementById("annotation-toolbar"), { anchor: OpenSeadragon.ControlAnchor.TOP_LEFT });

document.getElementById('annotation-toolbar').addEventListener('click', function (event) {
    event.preventDefault();
});

// Listen for annotation creation event
anno.on('createAnnotation', function (annotation) {
    // Create a new div element for the annotation
    var annotationItem = document.createElement('div');
    annotationItem.className = 'annotation-item';
    annotationItem.dataset.annotationId = annotation.id;

    // Add annotation details to the item
    annotationItem.innerHTML = `${annotation.body[0].value}`;

    // Add click event to make the annotation active
    annotationItem.addEventListener('click', function () {
        anno.selectAnnotation(annotation.id);
    });

    // Append the annotation item to the annotations list in the sidebar
    document.getElementById('annotations-list').appendChild(annotationItem);
});

// Listen for annotation deletion event
anno.on('deleteAnnotation', function (annotation) {
    // Find the corresponding annotation item in the sidebar
    var annotationItems = document.querySelectorAll('.annotation-item');
    annotationItems.forEach(function (item) {
        if (item.dataset.annotationId === annotation.id) {
            item.remove();
        }
    });
});

// Disable panning when polygon tool is active
anno.on('startSelection', function (event) {
    if (event.tool === 'polygon') {
        viewer.setMouseNavEnabled(false);
    }
});

// Re-enable panning when polygon tool is deactivated
anno.on('cancelSelection', function (event) {
    if (event.tool === 'polygon') {
        viewer.setMouseNavEnabled(true);
    }
});

anno.on('createAnnotation', function (event) {
    if (event.tool === 'polygon') {
        viewer.setMouseNavEnabled(true);
    }
});

// Add a listener to the viewer to update the position and zoom info
var positionEl = document.querySelectorAll('.sidebar-right .position')[0];
var zoomEl = document.querySelectorAll('.sidebar-right .zoom')[0];

// Default values
positionEl.innerHTML = 'Web:<br> (NA) <br><br>Viewport:<br> (NA) <br><br>Image:<br> (NA)';
zoomEl.innerHTML = 'Zoom:<br> NA <br><br>Image Zoom:<br> NA';

var updateZoom = function () {
    var zoom = viewer.viewport.getZoom(true);
    var imageZoom = viewer.viewport.viewportToImageZoom(zoom);

    zoomEl.innerHTML = 'Zoom:<br>' + (Math.round(zoom * 100) / 100) +
        '<br><br>Image Zoom:<br>' + (Math.round(imageZoom * 100) / 100);
}

viewer.addHandler('open', function () {
    var tracker = new OpenSeadragon.MouseTracker({
        element: viewer.container,
        moveHandler: function (event) {
            var webPoint = event.position;
            var viewportPoint = viewer.viewport.pointFromPixel(webPoint);
            var imagePoint = viewer.viewport.viewportToImageCoordinates(viewportPoint);
            var zoom = viewer.viewport.getZoom(true);
            var imageZoom = viewer.viewport.viewportToImageZoom(zoom);

            positionEl.innerHTML = 'Web:<br>' + webPoint.toString() +
                '<br><br>Viewport:<br>' + viewportPoint.toString() +
                '<br><br>Image:<br>' + imagePoint.toString();

            updateZoom();
        }
    });
    tracker.setTracking(true);
    viewer.addHandler('animation', updateZoom);
});
