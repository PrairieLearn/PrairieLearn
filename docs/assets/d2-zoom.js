// https://github.com/landmaj/mkdocs-d2-plugin/issues/20#issue-2630829657

// Initialize pan and zoom functionality
function initializeSvgPanZoom() {
  // Find all .d2 containers
  const containers = document.querySelectorAll('.d2');

  if (!containers.length) {
    console.error('No .d2 elements found');
    return;
  }

  // Initialize each container
  containers.forEach((container) => {
    const svg = container.querySelector('svg');
    if (!svg) return; // Skip if no SVG found in container

    // Create and add reset button with icon
    const resetBtn = document.createElement('button');
    resetBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
              <path d="M21 3v5h-5"/>
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
              <path d="M3 21v-5h5"/>
          </svg>
      `;
    resetBtn.style.cssText = `
          position: absolute;
          top: 8px;
          right: 8px;
          width: 28px;
          height: 28px;
          padding: 4px;
          background: #f8f8f8;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          color: #555;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: all 0.2s;
          z-index: 0;
      `;
    resetBtn.onmouseover = () => {
      resetBtn.style.transform = 'translateY(-1px)';
      resetBtn.style.background = '#f0f0f0';
    };
    resetBtn.onmouseout = () => {
      resetBtn.style.transform = 'translateY(0)';
      resetBtn.style.background = '#f8f8f8';
    };

    // Make container relative if it's not already
    if (window.getComputedStyle(container).position === 'static') {
      container.style.position = 'relative';
    }

    container.insertBefore(resetBtn, svg);

    const zoomBtn = document.createElement('button');
    zoomBtn.innerHTML = `
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
              <line x1="11" y1="8" x2="11" y2="14"/>
              <line x1="8" y1="11" x2="14" y2="11"/>
          </svg>
        `;
    zoomBtn.style.cssText = `
          position: absolute;
          top: 8px;
          right: 44px;
          width: 28px;
          height: 28px;
          padding: 4px;
          background: #f8f8f8;
          border: none;
          border-radius: 50%;
          cursor: pointer;
          color: #555;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: all 0.2s;
          z-index: 0;
        `;
    zoomBtn.onmouseover = () => {
      zoomBtn.style.transform = 'translateY(-1px)';
      zoomBtn.style.background = '#f0f0f0';
    };
    zoomBtn.onmouseout = () => {
      zoomBtn.style.transform = 'translateY(0)';
      zoomBtn.style.background = '#f8f8f8';
    };

    container.insertBefore(zoomBtn, svg);

    // Get initial viewBox values
    const initialViewBox = svg.viewBox.baseVal;
    let viewBox = {
      x: initialViewBox.x,
      y: initialViewBox.y,
      width: initialViewBox.width,
      height: initialViewBox.height,
    };

    let isZoomMode = false;
    // Pan variables
    let isPanning = false;
    let startPoint = { x: 0, y: 0 };
    let viewBoxStart = { ...viewBox };

    // Zoom handling
    svg.addEventListener('wheel', (e) => {
      if (!isZoomMode) return;
      e.preventDefault();

      const mousePoint = getMousePosition(e, svg);
      const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

      zoom(mousePoint, zoomFactor);
    });

    // Pan handling
    svg.addEventListener('mousedown', (e) => {
      e.preventDefault();
      // if (isZoomMode) return;
      isPanning = true;
      startPoint = getMousePosition(e, svg);
      viewBoxStart = { ...viewBox };
    });

    // Reset button (existing code)
    resetBtn.addEventListener('click', () => {
      viewBox = { ...originalViewBox };
      updateViewBox();
    });

    // Zoom toggle button
    zoomBtn.addEventListener('click', () => {
      isZoomMode = !isZoomMode;
      zoomBtn.style.background = isZoomMode ? '#e0e0e0' : '#f8f8f8';
      svg.style.cursor = isZoomMode ? 'grab' : '';
    });

    // Store initial values for reset
    const originalViewBox = { ...viewBox };

    // Use container-specific mousemove handler
    function handleMouseMove(e) {
      if (!isPanning) return;

      const currentPoint = getMousePosition(e, svg);
      const dx = ((currentPoint.x - startPoint.x) * viewBox.width) / svg.clientWidth;
      const dy = ((currentPoint.y - startPoint.y) * viewBox.height) / svg.clientHeight;

      viewBox.x = viewBoxStart.x - dx;
      viewBox.y = viewBoxStart.y - dy;

      updateViewBox();
    }

    // Use container-specific mouseup handler
    function handleMouseUp() {
      isPanning = false;
    }

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Reset button
    resetBtn.addEventListener('click', () => {
      viewBox = { ...originalViewBox };
      updateViewBox();
    });

    function getMousePosition(event, element) {
      const rect = element.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }

    function zoom(point, factor) {
      const oldWidth = viewBox.width;
      const oldHeight = viewBox.height;

      viewBox.width *= factor;
      viewBox.height *= factor;

      // Adjust viewBox position to zoom into/out of the mouse position
      viewBox.x += (point.x / svg.clientWidth) * (oldWidth - viewBox.width);
      viewBox.y += (point.y / svg.clientHeight) * (oldHeight - viewBox.height);

      updateViewBox();
    }

    function updateViewBox() {
      svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
    }

    // Clean up function to remove event listeners
    function cleanup() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }

    // Store cleanup function on the container
    container._cleanup = cleanup;
  });
}

// Cleanup function to remove all event listeners
function cleanup() {
  const containers = document.querySelectorAll('.d2');
  containers.forEach((container) => {
    if (container._cleanup) {
      container._cleanup();
    }
  });
}

// Call initialization when the DOM is ready
document.addEventListener('DOMContentLoaded', initializeSvgPanZoom);

// Optional: Clean up when leaving the page
window.addEventListener('unload', cleanup);
