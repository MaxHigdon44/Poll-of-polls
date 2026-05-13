export type WalesResultParty =
  | 'Plaid Cymru'
  | 'Reform'
  | 'Labour'
  | 'Conservative'
  | 'Green'
  | 'Liberal Democrat'
  | 'Other'

export type WalesElectedMember = {
  name: string
  party: Exclude<WalesResultParty, 'Other'>
}

export type WalesConstituencyResult2026 = {
  name: string
  votes: Record<WalesResultParty, number>
  members: WalesElectedMember[]
}

export function normalizeWalesResultName(name: string) {
  const normalized = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (normalized === 'gwynedd maldwynn') return 'gwynedd maldwyn'
  if (normalized === 'ceredigion penifro') return 'ceredigion penfro'
  return normalized
}

export const WALES_RESULTS_2026: WalesConstituencyResult2026[] = [
  {
    name: 'Afan Ogwr Rhondda',
    votes: {
      'Plaid Cymru': 24538,
      Reform: 22345,
      Labour: 11123,
      Conservative: 2831,
      Green: 2561,
      'Liberal Democrat': 1800,
      Other: 1251,
    },
    members: [
      { name: 'Sera Evans', party: 'Plaid Cymru' },
      { name: 'Benjamin McKenna', party: 'Reform' },
      { name: 'Alun Cox', party: 'Plaid Cymru' },
      { name: 'Steve Bayliss', party: 'Reform' },
      { name: 'Huw Irranca-Davies', party: 'Labour' },
      { name: 'Elyn Stephens', party: 'Plaid Cymru' },
    ],
  },
  {
    name: 'Bangor Conwy Môn',
    votes: {
      'Plaid Cymru': 31057,
      Reform: 19440,
      Labour: 4448,
      Conservative: 8555,
      Green: 3101,
      'Liberal Democrat': 1591,
      Other: 938,
    },
    members: [
      { name: 'Rhun ap Iorwerth', party: 'Plaid Cymru' },
      { name: 'Helen Jenner', party: 'Reform' },
      { name: 'Mair Rowlands', party: 'Plaid Cymru' },
      { name: 'Elfed Williams', party: 'Plaid Cymru' },
      { name: 'John Clarke', party: 'Reform' },
      { name: 'Janet Finch-Saunders', party: 'Conservative' },
    ],
  },
  {
    name: 'Blaenau Gwent Caerffili Rhymni',
    votes: {
      'Plaid Cymru': 29314,
      Reform: 23955,
      Labour: 7739,
      Conservative: 3353,
      Green: 2447,
      'Liberal Democrat': 1284,
      Other: 1741,
    },
    members: [
      { name: 'Delyth Jewell', party: 'Plaid Cymru' },
      { name: 'Llŷr Powell', party: 'Reform' },
      { name: 'Lindsay Whittle', party: 'Plaid Cymru' },
      { name: 'Catherine Cullen', party: 'Reform' },
      { name: 'Niamh Salkeld', party: 'Plaid Cymru' },
      { name: 'Joshua Kim', party: 'Reform' },
    ],
  },
  {
    name: 'Brycheiniog Tawe Nedd',
    votes: {
      'Plaid Cymru': 23276,
      Reform: 26897,
      Labour: 7086,
      Conservative: 6821,
      Green: 5405,
      'Liberal Democrat': 9549,
      Other: 2062,
    },
    members: [
      { name: 'James Evans', party: 'Reform' },
      { name: 'Sioned Williams', party: 'Plaid Cymru' },
      { name: 'Iain McIntosh', party: 'Reform' },
      { name: 'Rebeca Phillips', party: 'Plaid Cymru' },
      { name: 'Jane Dodds', party: 'Liberal Democrat' },
      { name: 'David Mills', party: 'Reform' },
    ],
  },
  {
    name: 'Caerdydd Ffynnon Taf',
    votes: {
      'Plaid Cymru': 32617,
      Reform: 17335,
      Labour: 11261,
      Conservative: 8479,
      Green: 9036,
      'Liberal Democrat': 8442,
      Other: 1050,
    },
    members: [
      { name: 'Dafydd Trystan', party: 'Plaid Cymru' },
      { name: 'Cai Parry-Jones', party: 'Reform' },
      { name: 'Zaynub Akbar', party: 'Plaid Cymru' },
      { name: 'Shav Taj', party: 'Labour' },
      { name: 'Nick Carter', party: 'Plaid Cymru' },
      { name: 'Paul Rock', party: 'Green' },
    ],
  },
  {
    name: 'Caerdydd Penarth',
    votes: {
      'Plaid Cymru': 36136,
      Reform: 15525,
      Labour: 10907,
      Conservative: 6818,
      Green: 12113,
      'Liberal Democrat': 2260,
      Other: 4294,
    },
    members: [
      { name: 'Anna Brychan', party: 'Plaid Cymru' },
      { name: 'Kiera Marshall', party: 'Plaid Cymru' },
      { name: 'Joseph Martin', party: 'Reform' },
      { name: 'Anthony Slaughter', party: 'Green' },
      { name: 'Leticia Gonzalez', party: 'Plaid Cymru' },
      { name: 'Huw Thomas', party: 'Labour' },
    ],
  },
  {
    name: 'Casnewydd Islwyn',
    votes: {
      'Plaid Cymru': 23069,
      Reform: 25571,
      Labour: 10622,
      Conservative: 8847,
      Green: 5898,
      'Liberal Democrat': 2683,
      Other: 1008,
    },
    members: [
      { name: 'Dan Thomas', party: 'Reform' },
      { name: 'Peredur Owen Griffiths', party: 'Plaid Cymru' },
      { name: 'Art Wright', party: 'Reform' },
      { name: 'Lyn Ackerman', party: 'Plaid Cymru' },
      { name: 'Jayne Bryant', party: 'Labour' },
      { name: 'Natasha Asghar', party: 'Conservative' },
    ],
  },
  {
    name: 'Ceredigion Penfro',
    votes: {
      'Plaid Cymru': 31943,
      Reform: 23003,
      Labour: 6495,
      Conservative: 14789,
      Green: 6324,
      'Liberal Democrat': 4613,
      Other: 1986,
    },
    members: [
      { name: 'Elin Jones', party: 'Plaid Cymru' },
      { name: 'Susan Archibald', party: 'Reform' },
      { name: 'Kerry Ferguson', party: 'Plaid Cymru' },
      { name: 'Paul Davies', party: 'Conservative' },
      { name: 'Paul Marr', party: 'Reform' },
      { name: 'Anna Nicholl', party: 'Plaid Cymru' },
    ],
  },
  {
    name: 'Clwyd',
    votes: {
      'Plaid Cymru': 22583,
      Reform: 25741,
      Labour: 8314,
      Conservative: 16193,
      Green: 4219,
      'Liberal Democrat': 2355,
      Other: 352,
    },
    members: [
      { name: 'Adrian Mason', party: 'Reform' },
      { name: 'Llŷr Gruffydd', party: 'Plaid Cymru' },
      { name: 'Darren Millar', party: 'Conservative' },
      { name: 'Louise Emery', party: 'Reform' },
      { name: 'Becca Martin', party: 'Plaid Cymru' },
      { name: 'Thomas Montgomery', party: 'Reform' },
    ],
  },
  {
    name: 'Fflint Wrecsam',
    votes: {
      'Plaid Cymru': 18440,
      Reform: 25349,
      Labour: 8555,
      Conservative: 9017,
      Green: 5138,
      'Liberal Democrat': 2647,
      Other: 850,
    },
    members: [
      { name: 'Cristiana Emsley', party: 'Reform' },
      { name: 'Nigel Williams', party: 'Reform' },
      { name: 'Carrie Harper', party: 'Plaid Cymru' },
      { name: 'Marc Jones', party: 'Plaid Cymru' },
      { name: 'Sam Rowlands', party: 'Conservative' },
      { name: 'Ken Skates', party: 'Labour' },
    ],
  },
  {
    name: 'Gwynedd Maldwyn',
    votes: {
      'Plaid Cymru': 36087,
      Reform: 22667,
      Labour: 4466,
      Conservative: 5650,
      Green: 4090,
      'Liberal Democrat': 4554,
      Other: 4176,
    },
    members: [
      { name: 'Siân Gwenllian', party: 'Plaid Cymru' },
      { name: 'Andrew Griffin', party: 'Reform' },
      { name: 'Mabon ap Gwynfor', party: 'Plaid Cymru' },
      { name: 'Beca Brown', party: 'Plaid Cymru' },
      { name: 'Claire Johnson-Wood', party: 'Reform' },
      { name: 'Elwyn Vaughan', party: 'Plaid Cymru' },
    ],
  },
  {
    name: 'Gŵyr Abertawe',
    votes: {
      'Plaid Cymru': 25076,
      Reform: 21641,
      Labour: 11195,
      Conservative: 7523,
      Green: 6383,
      'Liberal Democrat': 6262,
      Other: 642,
    },
    members: [
      { name: 'Gwyn Williams', party: 'Plaid Cymru' },
      { name: "Francesca O'Brien", party: 'Reform' },
      { name: 'Safa Elhassan', party: 'Plaid Cymru' },
      { name: 'Mike Hedges', party: 'Labour' },
      { name: 'Steven Rodaway', party: 'Reform' },
      { name: 'John Davies', party: 'Plaid Cymru' },
    ],
  },
  {
    name: 'Pen-y-bont Bro Morgannwg',
    votes: {
      'Plaid Cymru': 27407,
      Reform: 24602,
      Labour: 9518,
      Conservative: 12464,
      Green: 4220,
      'Liberal Democrat': 2175,
      Other: 1415,
    },
    members: [
      { name: 'Mark Hooper', party: 'Plaid Cymru' },
      { name: 'Sarah Cooper-Lesadd', party: 'Reform' },
      { name: 'Sarah Rees', party: 'Plaid Cymru' },
      { name: 'Andrew RT Davies', party: 'Conservative' },
      { name: 'Gareth Thomas', party: 'Reform' },
      { name: 'Sarah Murphy', party: 'Labour' },
    ],
  },
  {
    name: 'Pontypridd Cynon Merthyr',
    votes: {
      'Plaid Cymru': 28687,
      Reform: 22217,
      Labour: 9344,
      Conservative: 4339,
      Green: 3466,
      'Liberal Democrat': 1393,
      Other: 3182,
    },
    members: [
      { name: 'Heledd Fychan', party: 'Plaid Cymru' },
      { name: "Jason O'Connell", party: 'Reform' },
      { name: 'Lis McLean', party: 'Plaid Cymru' },
      { name: 'David Hughes', party: 'Reform' },
      { name: 'Sara Crowley', party: 'Plaid Cymru' },
      { name: 'Vikki Howells', party: 'Labour' },
    ],
  },
  {
    name: 'Sir Fynwy Torfaen',
    votes: {
      'Plaid Cymru': 18275,
      Reform: 24155,
      Labour: 11672,
      Conservative: 13394,
      Green: 6375,
      'Liberal Democrat': 2742,
      Other: 1093,
    },
    members: [
      { name: 'Laura Anne Jones', party: 'Reform' },
      { name: 'Matthew Jones', party: 'Plaid Cymru' },
      { name: 'Peter Fox', party: 'Conservative' },
      { name: 'Stephen Senior', party: 'Reform' },
      { name: 'Lynne Neagle', party: 'Labour' },
      { name: 'Donna Cushing', party: 'Plaid Cymru' },
    ],
  },
  {
    name: 'Sir Gaerfyrddin',
    votes: {
      'Plaid Cymru': 36160,
      Reform: 27542,
      Labour: 6458,
      Conservative: 5853,
      Green: 3832,
      'Liberal Democrat': 1662,
      Other: 2476,
    },
    members: [
      { name: 'Cefin Campbell', party: 'Plaid Cymru' },
      { name: 'Gareth Beer', party: 'Reform' },
      { name: 'Nerys Evans', party: 'Plaid Cymru' },
      { name: 'Carmelo Colasanto', party: 'Reform' },
      { name: 'Adam Price', party: 'Plaid Cymru' },
      { name: 'Sarah Edwards', party: 'Labour' },
    ],
  },
]

export const WALES_RESULTS_2026_BY_NAME = new Map(
  WALES_RESULTS_2026.map(result => [normalizeWalesResultName(result.name), result])
)

export function computeWalesVoteShares(
  votes: Record<WalesResultParty, number>
): Record<WalesResultParty, number> {
  const total = Object.values(votes).reduce((sum, value) => sum + value, 0)
  const shares = {} as Record<WalesResultParty, number>
  ;(Object.entries(votes) as Array<[WalesResultParty, number]>).forEach(([party, value]) => {
    shares[party] = total ? (value / total) * 100 : 0
  })
  return shares
}

export function computeWalesSeatCountsByConstituency(
  members: WalesElectedMember[]
): Record<string, number> {
  const counts: Record<string, number> = {}
  members.forEach(member => {
    counts[member.party] = (counts[member.party] || 0) + 1
  })
  return counts
}

export function computeWalesElectedMsTotals() {
  const totals: Record<string, number> = {}
  WALES_RESULTS_2026.forEach(result => {
    result.members.forEach(member => {
      totals[member.party] = (totals[member.party] || 0) + 1
    })
  })
  return totals
}
