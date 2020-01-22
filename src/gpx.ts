// A very hacky conversion of simple lat,lon pairs into GPX
// routes. Don't need to worry too much about escaping because we
// control the source data.

function escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c: string): string => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
            default: throw 'unreachable';
        }
    });
}

export function toGpx(name: string, coordinates: number[][]): string {
    const escaped = escapeXml(name);
    const tracks = coordinates.map(pt => `<trkpt lat="${pt[1]}" lon="${pt[0]}"></trkpt>`);

    return `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxdata="http://www.cluetrust.com/XML/GPXDATA/1/0" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd http://www.cluetrust.com/XML/GPXDATA/1/0 http://www.cluetrust.com/Schemas/gpxdata10.xsd" version="1.1">
  <metadata>
    <name>${name}</name>
  </metadata>
  <trk>
    <name>${name}</name>
    <trkseg>
      ${tracks.join('\n')}
    </trkseg>
  </trk>
</gpx>
`;
}
