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
