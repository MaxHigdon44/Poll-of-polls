import fs from 'fs'
import path from 'path'

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

export function loadWalesProjectionInputs() {
  const dataDir = path.join(process.cwd(), 'public', 'data')
  return {
    lookup: readJsonFile(path.join(dataDir, 'senedd-to-wpc-lookup.json')),
    gePcon: readJsonFile(path.join(dataDir, 'ge2024-pcon.json')),
    leaveLookup: readJsonFile(path.join(dataDir, 'leave-share.json')),
    ageLookup: readJsonFile(path.join(dataDir, 'age-share.json')),
    tenureLookup: readJsonFile(path.join(dataDir, 'tenure-share.json')),
    nssecLookup: readJsonFile(path.join(dataDir, 'nssec-share.json')),
    degreeLookup: readJsonFile(path.join(dataDir, 'degree-share.json')),
    ruralLookup: readJsonFile(path.join(dataDir, 'rural-urban-share.json')),
    wardToSenedd: readJsonFile(path.join(dataDir, 'ward-to-senedd.json')),
  }
}
