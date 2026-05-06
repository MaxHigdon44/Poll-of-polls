import fs from 'fs'
import path from 'path'

function readJsonFile<T>(relativePath: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', relativePath)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export function loadScotlandProjectionInputs() {
  return {
    constituencyGeo: readJsonFile('scotland-constituencies.geojson'),
    geLookup: readJsonFile('ge2024-pcon.json'),
    spcToWpcLookup: readJsonFile('spc-to-wpc-lookup.json'),
    wpcLeaveLookup: readJsonFile('scotland-wpc-leave-share.json'),
    tenureLookup: readJsonFile('scotland-tenure-share.json'),
    ageLookup: readJsonFile('scotland-age-share.json'),
    degreeLookup: readJsonFile('scotland-degree-share.json'),
    nssecLookup: readJsonFile('scotland-nssec-share.json'),
  }
}
