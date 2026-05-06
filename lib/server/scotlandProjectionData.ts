import fs from 'fs'
import path from 'path'

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export function loadScotlandProjectionInputs() {
  const dataDir = path.join(process.cwd(), 'public', 'data')
  return {
    constituencyGeo: readJsonFile(path.join(dataDir, 'scotland-constituencies.geojson')),
    geLookup: readJsonFile(path.join(dataDir, 'ge2024-pcon.json')),
    spcToWpcLookup: readJsonFile(path.join(dataDir, 'spc-to-wpc-lookup.json')),
    wpcLeaveLookup: readJsonFile(path.join(dataDir, 'scotland-wpc-leave-share.json')),
    tenureLookup: readJsonFile(path.join(dataDir, 'scotland-tenure-share.json')),
    ageLookup: readJsonFile(path.join(dataDir, 'scotland-age-share.json')),
    degreeLookup: readJsonFile(path.join(dataDir, 'scotland-degree-share.json')),
    nssecLookup: readJsonFile(path.join(dataDir, 'scotland-nssec-share.json')),
  }
}
