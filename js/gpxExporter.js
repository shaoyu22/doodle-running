// Export route to GPX and TCX formats for Garmin
class GPXExporter {
    constructor(route, routeName = 'Doodle Run') {
        this.route = route;
        this.routeName = routeName;
    }

    // Generate GPX file content
    generateGPX() {
        const timestamp = new Date().toISOString();
        
        let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Doodle Run" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${this.routeName}</name>
    <time>${timestamp}</time>
  </metadata>
  <trk>
    <name>${this.routeName}</name>
    <trkseg>
`;

        this.route.forEach(point => {
            gpx += `      <trkpt lat="${point.lat.toFixed(6)}" lon="${point.lng.toFixed(6)}">
        <ele>${point.ele || 0}</ele>
      </trkpt>
`;
        });

        gpx += `    </trkseg>
  </trk>
</gpx>`;

        return gpx;
    }

    // Generate TCX file content (Training Center XML for Garmin)
    generateTCX() {
        const timestamp = new Date().toISOString();
        
        let tcx = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2">
  <Courses>
    <Course>
      <Name>${this.routeName}</Name>
      <Lap>
        <TotalTimeSeconds>0</TotalTimeSeconds>
        <DistanceMeters>0</DistanceMeters>
        <BeginPosition>
          <LatitudeDegrees>${this.route[0].lat.toFixed(6)}</LatitudeDegrees>
          <LongitudeDegrees>${this.route[0].lng.toFixed(6)}</LongitudeDegrees>
        </BeginPosition>
        <EndPosition>
          <LatitudeDegrees>${this.route[this.route.length - 1].lat.toFixed(6)}</LatitudeDegrees>
          <LongitudeDegrees>${this.route[this.route.length - 1].lng.toFixed(6)}</LongitudeDegrees>
        </EndPosition>
      </Lap>
      <Track>
`;

        this.route.forEach(point => {
            tcx += `        <Trackpoint>
          <Time>${timestamp}</Time>
          <Position>
            <LatitudeDegrees>${point.lat.toFixed(6)}</LatitudeDegrees>
            <LongitudeDegrees>${point.lng.toFixed(6)}</LongitudeDegrees>
          </Position>
          <AltitudeMeters>${point.ele || 0}</AltitudeMeters>
        </Trackpoint>
`;
        });

        tcx += `      </Track>
    </Course>
  </Courses>
</TrainingCenterDatabase>`;

        return tcx;
    }

    // Download file
    download(content, filename, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    downloadGPX() {
        const gpx = this.generateGPX();
        this.download(gpx, `${this.routeName}.gpx`, 'application/gpx+xml');
    }

    downloadTCX() {
        const tcx = this.generateTCX();
        this.download(tcx, `${this.routeName}.tcx`, 'application/vnd.garmin.tcx+xml');
    }
}
