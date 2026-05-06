import fs from 'fs'
import path from 'path'

function readJsonFile<T>(relativePath: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', relativePath)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export function loadWalesProjectionInputs() {
  return {
    lookup: readJsonFile('senedd-to-wpc-lookup.json'),
    gePcon: readJsonFile('ge2024-pcon.json'),
    leaveLookup: readJsonFile('leave-share.json'),
    ageLookup: readJsonFile('age-share.json'),
    tenureLookup: readJsonFile('tenure-share.json'),
    nssecLookup: readJsonFile('nssec-share.json'),
    degreeLookup: readJsonFile('degree-share.json'),
    ruralLookup: readJsonFile('rural-urban-share.json'),
    wardToSenedd: readJsonFile('ward-to-senedd.json'),
  }
}
