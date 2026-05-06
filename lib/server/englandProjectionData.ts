import fs from 'fs'
import path from 'path'
import type { computeEnglandWardProjectionSnapshot } from '@/lib/local2026/councilProjections'

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

type EnglandSnapshotArgs = Parameters<typeof computeEnglandWardProjectionSnapshot>[0]

export function loadEnglandProjectionInputs(options?: { includeGeo?: boolean }) {
  const includeGeo = options?.includeGeo ?? true
  const dataDir = path.join(process.cwd(), 'public', 'data')
  return {
    baseline: readJsonFile<EnglandSnapshotArgs['baseline']>(path.join(dataDir, 'ward-baseline.json')),
    councilSeats: readJsonFile<EnglandSnapshotArgs['councilSeats']>(path.join(dataDir, 'council-seats.json')),
    councilPrevious: readJsonFile<EnglandSnapshotArgs['councilPrevious']>(
      path.join(dataDir, 'council-previous.json')
    ),
    ...(includeGeo
      ? {
          ladGeo: readJsonFile<EnglandSnapshotArgs['ladGeo']>(path.join(dataDir, 'lads.geojson')),
          countyGeo: readJsonFile<EnglandSnapshotArgs['countyGeo']>(path.join(dataDir, 'counties.geojson')),
        }
      : {}),
    leaveLookup: readJsonFile<EnglandSnapshotArgs['leaveLookup']>(path.join(dataDir, 'leave-share.json')),
    ageLookup: readJsonFile<EnglandSnapshotArgs['ageLookup']>(path.join(dataDir, 'age-share.json')),
    regionLookup: readJsonFile<EnglandSnapshotArgs['regionLookup']>(path.join(dataDir, 'lad-region.json')),
    nssecLookup: readJsonFile<EnglandSnapshotArgs['nssecLookup']>(path.join(dataDir, 'nssec-share.json')),
    degreeLookup: readJsonFile<EnglandSnapshotArgs['degreeLookup']>(path.join(dataDir, 'degree-share.json')),
    tenureLookup: readJsonFile<EnglandSnapshotArgs['tenureLookup']>(path.join(dataDir, 'tenure-share.json')),
    ruralUrbanLookup: readJsonFile<EnglandSnapshotArgs['ruralUrbanLookup']>(
      path.join(dataDir, 'rural-urban-share.json')
    ),
    wardVacancyLookup: readJsonFile<EnglandSnapshotArgs['wardVacancyLookup']>(
      path.join(dataDir, 'ward-vacancies.json')
    ),
    wardToPcon: readJsonFile<EnglandSnapshotArgs['wardToPcon']>(path.join(dataDir, 'ward-to-pcon.json')),
    cedToPcon: readJsonFile<EnglandSnapshotArgs['cedToPcon']>(path.join(dataDir, 'ced-to-pcon.json')),
    geLookup: readJsonFile<EnglandSnapshotArgs['geLookup']>(path.join(dataDir, 'ge2024-pcon.json')),
  }
}
