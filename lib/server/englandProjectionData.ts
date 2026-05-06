import fs from 'fs'
import path from 'path'
import type { computeEnglandWardProjectionSnapshot } from '@/lib/local2026/councilProjections'

function readJsonFile<T>(relativePath: string): T {
  const filePath = path.join(process.cwd(), 'public', 'data', relativePath)
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

type EnglandSnapshotArgs = Parameters<typeof computeEnglandWardProjectionSnapshot>[0]

export function loadEnglandProjectionInputs(options?: { includeGeo?: boolean }) {
  const includeGeo = options?.includeGeo ?? true
  return {
    baseline: readJsonFile<EnglandSnapshotArgs['baseline']>('ward-baseline.json'),
    councilSeats: readJsonFile<EnglandSnapshotArgs['councilSeats']>('council-seats.json'),
    councilPrevious: readJsonFile<EnglandSnapshotArgs['councilPrevious']>('council-previous.json'),
    ...(includeGeo
      ? {
          ladGeo: readJsonFile<EnglandSnapshotArgs['ladGeo']>('lads.geojson'),
          countyGeo: readJsonFile<EnglandSnapshotArgs['countyGeo']>('counties.geojson'),
        }
      : {}),
    leaveLookup: readJsonFile<EnglandSnapshotArgs['leaveLookup']>('leave-share.json'),
    ageLookup: readJsonFile<EnglandSnapshotArgs['ageLookup']>('age-share.json'),
    regionLookup: readJsonFile<EnglandSnapshotArgs['regionLookup']>('lad-region.json'),
    nssecLookup: readJsonFile<EnglandSnapshotArgs['nssecLookup']>('nssec-share.json'),
    degreeLookup: readJsonFile<EnglandSnapshotArgs['degreeLookup']>('degree-share.json'),
    tenureLookup: readJsonFile<EnglandSnapshotArgs['tenureLookup']>('tenure-share.json'),
    ruralUrbanLookup: readJsonFile<EnglandSnapshotArgs['ruralUrbanLookup']>('rural-urban-share.json'),
    wardVacancyLookup: readJsonFile<EnglandSnapshotArgs['wardVacancyLookup']>('ward-vacancies.json'),
    wardToPcon: readJsonFile<EnglandSnapshotArgs['wardToPcon']>('ward-to-pcon.json'),
    cedToPcon: readJsonFile<EnglandSnapshotArgs['cedToPcon']>('ced-to-pcon.json'),
    geLookup: readJsonFile<EnglandSnapshotArgs['geLookup']>('ge2024-pcon.json'),
  }
}
