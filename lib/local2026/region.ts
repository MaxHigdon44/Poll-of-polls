export const REGION_DELTAS: Record<string, Record<string, number>> = {
  Conservative: {
    'East Midlands': 2.4,
    'East of England': 3.4,
    London: 2.14,
    'North East': -0.8,
    'North West': -3.0,
    Scotland: -8.14,
    'South East': 4.8,
    'South West': -0.8,
    Wales: -6.29,
    'West Midlands': -0.2,
    'Yorkshire and the Humber': 0.4,
  },
  Labour: {
    'East Midlands': -4.8,
    'East of England': -2.6,
    London: 8.57,
    'North East': 5.0,
    'North West': 2.4,
    Scotland: -4.57,
    'South East': -6.2,
    'South West': -2.8,
    Wales: -1.71,
    'West Midlands': -1.2,
    'Yorkshire and the Humber': -4.0,
  },
  Reform: {
    'East Midlands': 5.2,
    'East of England': 3.2,
    London: -6.57,
    'North East': 2.2,
    'North West': -1.2,
    Scotland: -6.14,
    'South East': 0.4,
    'South West': 0.6,
    Wales: 2.29,
    'West Midlands': 0.4,
    'Yorkshire and the Humber': 6.6,
  },
  'Liberal Democrat': {
    'East Midlands': -3.0,
    'East of England': -1.6,
    London: -0.57,
    'North East': -5.0,
    'North West': -2.0,
    Scotland: -0.86,
    'South East': 5.6,
    'South West': 7.2,
    Wales: -2.14,
    'West Midlands': 0.0,
    'Yorkshire and the Humber': -3.6,
  },
  Green: {
    'East Midlands': 1.2,
    'East of England': -0.8,
    London: 1.43,
    'North East': -1.2,
    'North West': 1.4,
    Scotland: -4.14,
    'South East': -0.8,
    'South West': -2.2,
    Wales: -4.29,
    'West Midlands': 1.6,
    'Yorkshire and the Humber': -0.4,
  },
  Other: {
    'East Midlands': 0,
    'East of England': 0.4,
    London: -1.0,
    'North East': 0.8,
    'North West': 1.4,
    Scotland: -1.0,
    'South East': -0.6,
    'South West': -0.8,
    Wales: 0.0,
    'West Midlands': 2.4,
    'Yorkshire and the Humber': 0.0,
  },
  SNP: {
    Scotland: 26.43,
  },
  'Plaid Cymru': {
    Wales: 13.0,
  },
}

export const REGION_EFFECT_STRENGTH = 0.5

const REGION_NAME_MAP: Record<string, string> = {
  'yorkshire and the humber': 'Yorkshire and the Humber',
  yorkshire: 'Yorkshire and the Humber',
}

function normalizeRegion(value: string | null | undefined) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const key = raw.toLowerCase()
  return REGION_NAME_MAP[key] || raw
}

export function getRegionAdjustment(party: string, regionName: string | null | undefined) {
  const normalized = normalizeRegion(regionName)
  if (!normalized) return 0
  const deltas = REGION_DELTAS[party]
  if (!deltas) return 0
  return deltas[normalized] ?? 0
}
