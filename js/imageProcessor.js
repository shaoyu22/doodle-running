// Image processing: extract edge/contour points from canvas drawing or uploaded image
class ImageProcessor {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    // Extract edge/contour points from the canvas
    // Uses Sobel edge detection so uploaded images produce their outline, not fill
    extractPoints(threshold = 128) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const imageData = this.ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Build grayscale map
        const gray = new Float32Array(width * height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                // Invert so drawn/dark pixels are "high" for edge detection on white background
                gray[y * width + x] = 255 - (r * 0.299 + g * 0.587 + b * 0.114);
            }
        }

        // Sobel edge detection
        const edges = new Float32Array(width * height);
        let maxEdge = 0;
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const gx =
                    -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)] +
                    -2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)] +
                    -gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)];
                const gy =
                    -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)] +
                    gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)];
                const mag = Math.sqrt(gx * gx + gy * gy);
                edges[y * width + x] = mag;
                if (mag > maxEdge) maxEdge = mag;
            }
        }

        // Collect edge points above threshold (normalized)
        const edgeThreshold = maxEdge * 0.2; // 20% of max edge strength
        const points = [];
        const step = 3;
        for (let y = step; y < height - step; y += step) {
            for (let x = step; x < width - step; x += step) {
                if (edges[y * width + x] > edgeThreshold) {
                    points.push({ x, y });
                }
            }
        }

        // If no edges found (blank or fully filled canvas), fall back to dark pixel detection
        if (points.length < 10) {
            return this._extractDarkPoints(threshold);
        }

        return points;
    }

    // Fallback: extract dark pixels directly (for hand-drawn strokes)
    _extractDarkPoints(threshold = 128) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const points = [];
        const step = 2;
        for (let y = 0; y < this.canvas.height; y += step) {
            for (let x = 0; x < this.canvas.width; x += step) {
                const index = (y * this.canvas.width + x) * 4;
                const r = data[index], g = data[index + 1], b = data[index + 2], a = data[index + 3];
                const brightness = (r + g + b) / 3;
                if (brightness < threshold && a > 128) {
                    points.push({ x, y });
                }
            }
        }
        return points;
    }

    // Order edge points to form a continuous path using a greedy nearest-neighbor chain.
    // Starts from the topmost-leftmost point and traces the outline.
    orderPoints(points) {
        if (points.length === 0) return [];

        // Start from point closest to top-left (or use topmost for a clean start)
        let startIdx = 0;
        let minY = Infinity;
        for (let i = 0; i < points.length; i++) {
            if (points[i].y < minY) { minY = points[i].y; startIdx = i; }
        }

        const ordered = [points[startIdx]];
        const remaining = points.slice();
        remaining.splice(startIdx, 1);

        // Max jump distance to avoid connecting distant disconnected parts
        const maxJump = Math.max(this.canvas.width, this.canvas.height) * 0.15;

        while (remaining.length > 0) {
            const last = ordered[ordered.length - 1];
            let nearestIndex = 0;
            let nearestDist = Infinity;

            for (let i = 0; i < remaining.length; i++) {
                const dist = Math.hypot(remaining[i].x - last.x, remaining[i].y - last.y);
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIndex = i;
                }
            }

            // Stop chaining if next nearest is too far (prevents cross-shape jumps)
            if (nearestDist > maxJump) break;

            ordered.push(remaining[nearestIndex]);
            remaining.splice(nearestIndex, 1);

            if (ordered.length > 800) break;
        }

        return ordered;
    }

    // Simplify path using Douglas-Peucker algorithm
    simplifyPath(points, tolerance = 5) {
        if (points.length <= 2) return points;

        const douglasPeucker = (pts, epsilon) => {
            let dmax = 0;
            let index = 0;
            const end = pts.length - 1;

            for (let i = 1; i < end; i++) {
                const d = this.perpendicularDistance(pts[i], pts[0], pts[end]);
                if (d > dmax) {
                    index = i;
                    dmax = d;
                }
            }

            if (dmax > epsilon) {
                const left = douglasPeucker(pts.slice(0, index + 1), epsilon);
                const right = douglasPeucker(pts.slice(index), epsilon);
                return left.slice(0, -1).concat(right);
            } else {
                return [pts[0], pts[end]];
            }
        };

        return douglasPeucker(points, tolerance);
    }

    perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        const mag = Math.hypot(dx, dy);
        if (mag === 0) return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);

        const u = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (mag * mag);
        const closestX = lineStart.x + u * dx;
        const closestY = lineStart.y + u * dy;

        return Math.hypot(point.x - closestX, point.y - closestY);
    }
}
