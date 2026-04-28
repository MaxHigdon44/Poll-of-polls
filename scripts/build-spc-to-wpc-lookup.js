const fs = require('fs');
const path = require('path');

const spcPath = path.join(__dirname, '..', 'public', 'data', 'scotland-constituencies.geojson');
const wpcPath = path.join(__dirname, '..', 'public', 'data', 'wpc-2024-scotland.geojson');
const outJson = path.join(__dirname, '..', 'public', 'data', 'spc-to-wpc-lookup.json');
const outCsv = path.join(__dirname, '..', 'public', 'data', 'spc-to-wpc-lookup.csv');

const spc = JSON.parse(fs.readFileSync(spcPath, 'utf8'));
const wpc = JSON.parse(fs.readFileSync(wpcPath, 'utf8'));

function ringContainsPoint(ring, point) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 0.0) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonContainsPoint(polygonCoords, point) {
  if (!polygonCoords.length) return false;
  const outer = polygonCoords[0];
  if (!ringContainsPoint(outer, point)) return false;
  for (let i = 1; i < polygonCoords.length; i++) {
    if (ringContainsPoint(polygonCoords[i], point)) return false;
  }
  return true;
}

function featureContainsPoint(feature, point) {
  const geom = feature.geometry;
  if (!geom) return false;
  if (geom.type === 'Polygon') {
    return polygonContainsPoint(geom.coordinates, point);
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(coords => polygonContainsPoint(coords, point));
  }
  return false;
}

function bboxForCoords(coords, bbox) {
  for (const ring of coords) {
    for (const [x, y] of ring) {
      if (x < bbox[0]) bbox[0] = x;
      if (y < bbox[1]) bbox[1] = y;
      if (x > bbox[2]) bbox[2] = x;
      if (y > bbox[3]) bbox[3] = y;
    }
  }
}

function featureBBox(feature) {
  const geom = feature.geometry;
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  if (geom.type === 'Polygon') {
    bboxForCoords(geom.coordinates, bbox);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates) {
      bboxForCoords(poly, bbox);
    }
  }
  return bbox;
}

function pointInBBox(point, bbox) {
  const [x, y] = point;
  return x >= bbox[0] && x <= bbox[2] && y >= bbox[1] && y <= bbox[3];
}

function randomPointInBBox(bbox) {
  const [minX, minY, maxX, maxY] = bbox;
  return [minX + Math.random() * (maxX - minX), minY + Math.random() * (maxY - minY)];
}

const wpcFeatures = wpc.features.map(feature => ({
  feature,
  bbox: featureBBox(feature),
  code: feature.properties.PCON24CD,
  name: feature.properties.PCON24NM,
}));

const SAMPLE_SIZE = 500;

const results = spc.features.map(spcFeature => {
  const spcProps = spcFeature.properties || {};
  const spcName = spcProps.SPC22NM;
  const spcCode = spcProps.SPC22CD;
  const spcBbox = featureBBox(spcFeature);

  const counts = new Map();
  let accepted = 0;
  let attempts = 0;

  while (accepted < SAMPLE_SIZE && attempts < SAMPLE_SIZE * 200) {
    attempts += 1;
    const point = randomPointInBBox(spcBbox);
    if (!featureContainsPoint(spcFeature, point)) continue;
    accepted += 1;
    for (const wpcItem of wpcFeatures) {
      if (!pointInBBox(point, wpcItem.bbox)) continue;
      if (featureContainsPoint(wpcItem.feature, point)) {
        counts.set(wpcItem.code, (counts.get(wpcItem.code) || 0) + 1);
        break;
      }
    }
  }

  const overlaps = [...counts.entries()]
    .map(([code, count]) => {
      const match = wpcFeatures.find(item => item.code === code);
      return {
        code,
        name: match ? match.name : code,
        share: accepted ? count / accepted : 0,
      };
    })
    .sort((a, b) => b.share - a.share);

  const primary = overlaps[0] || { code: null, name: null, share: 0 };

  return {
    spcCode,
    spcName,
    primaryWpcCode: primary.code,
    primaryWpcName: primary.name,
    overlapShare: primary.share,
    overlaps: overlaps.slice(0, 3),
    sampleSize: accepted,
  };
});

fs.writeFileSync(outJson, JSON.stringify({
  source: {
    spc: 'scotland-constituencies.geojson',
    wpc: 'wpc-2024-scotland.geojson',
  },
  method: 'Monte Carlo point-in-polygon overlap estimate',
  sampleSize: SAMPLE_SIZE,
  results,
}, null, 2));

const csvLines = [
  'spcCode,spcName,primaryWpcCode,primaryWpcName,overlapShare,sampleSize,overlaps',
];
for (const row of results) {
  const overlaps = row.overlaps
    .map(item => `${item.code}:${item.share.toFixed(3)}`)
    .join('|');
  csvLines.push([
    row.spcCode,
    `"${String(row.spcName).replace(/"/g, '""')}"`,
    row.primaryWpcCode,
    `"${String(row.primaryWpcName).replace(/"/g, '""')}"`,
    row.overlapShare.toFixed(4),
    row.sampleSize,
    `"${overlaps}"`,
  ].join(','));
}
fs.writeFileSync(outCsv, csvLines.join('\n'));

console.log('Wrote', outJson, outCsv);
