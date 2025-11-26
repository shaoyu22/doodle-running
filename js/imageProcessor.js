// Image processing: extract edge points from canvas drawing or uploaded image
class ImageProcessor {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
    }

    // Extract points from the canvas that represent the drawing
    extractPoints(threshold = 128) {
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const data = imageData.data;
        const points = [];

        // Sample points from the image (every nth pixel to reduce density)
        const step = 2;
        for (let y = 0; y < this.canvas.height; y += step) {
            for (let x = 0; x < this.canvas.width; x += step) {
                const index = (y * this.canvas.width + x) * 4;
                const r = data[index];
                const g = data[index + 1];
                const b = data[index + 2];
                const a = data[index + 3];

                // If pixel is dark enough (drawn on), add it
                const brightness = (r + g + b) / 3;
                if (brightness < threshold && a > 128) {
                    points.push({ x, y });
                }
            }
        }

        return points;
    }

    // Order points to create a continuous path
    orderPoints(points) {
        if (points.length === 0) return [];

        const ordered = [points[0]];
        const remaining = points.slice(1);

        while (remaining.length > 0) {
            const last = ordered[ordered.length - 1];
            let nearestIndex = 0;
            let nearestDist = Infinity;

            // Find nearest unvisited point
            for (let i = 0; i < remaining.length; i++) {
                const dist = Math.hypot(
                    remaining[i].x - last.x,
                    remaining[i].y - last.y
                );
                if (dist < nearestDist) {
                    nearestDist = dist;
                    nearestIndex = i;
                }
            }

            ordered.push(remaining[nearestIndex]);
            remaining.splice(nearestIndex, 1);

            // Optimization: stop if path gets too long
            if (ordered.length > 1000) break;
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
