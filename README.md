# 🏃 Doodle Run

Create running routes from your drawings! Draw or upload an image, and Doodle Run will generate a GPS route that traces your artwork, ready to export to Garmin Connect.

## Features

- **Draw or Upload**: Create doodles directly on canvas or upload existing images
- **Smart Path Detection**: Automatically detects and traces the framework/outline of your drawing
- **Road Snapping**: Routes are automatically snapped to roads, sidewalks, and paths for safe running
- **Location Search**: Search for any location worldwide or use your current GPS position
- **Configurable Routes**: Set custom distance and starting location
- **Route Preview**: Visualize your route on an interactive map
- **Detailed Information**: View distance, number of waypoints, and estimated completion time
- **Garmin Compatible**: Export to GPX and TCX formats for Garmin Connect

## How to Use

1. **Create Your Doodle**
   - Draw directly on the canvas using your mouse or touchscreen
   - Or upload an existing image file
   - Use the Clear button to start over

2. **Configure Your Route**
   - Set your target distance in kilometers
   - Search for a location or use your current position
   - Or manually enter GPS coordinates (latitude/longitude)
   - Click "Generate Route" (routes will snap to safe running paths)

3. **Preview & Download**
   - View your route on the interactive map
   - Check the route information (distance, points, estimated time)
   - Download as GPX or TCX file
   - Import the file to Garmin Connect

## Getting Started

Simply open `index.html` in a web browser. No installation or build process required!

## Technical Details

- Pure JavaScript (no frameworks required)
- Leaflet.js for map visualization
- Canvas API for drawing
- OSRM (Open Source Routing Machine) for road snapping
- Nominatim for geocoding/location search
- Browser Geolocation API for current position
- Douglas-Peucker algorithm for path simplification
- Haversine formula for accurate GPS distance calculation

## File Structure

```
doodle-run/
├── index.html              # Main HTML page
├── css/
│   └── style.css          # Styling
├── js/
│   ├── app.js             # Main application logic
│   ├── imageProcessor.js  # Image to path conversion
│   ├── routeGenerator.js  # GPS route generation
│   └── gpxExporter.js     # GPX/TCX export functionality
└── README.md              # This file
```

## Browser Compatibility

Works in all modern browsers that support:
- HTML5 Canvas
- ES6 JavaScript
- Geolocation API (optional)

## Future Enhancements

- Automatic location detection using browser geolocation
- Terrain elevation data integration
- Route optimization to follow actual roads/paths
- Multiple drawing layers
- Route sharing functionality
- Mobile app version

## License

MIT License - Feel free to use and modify!
