export const SCOTLAND_2026_TO_PREVIOUS_CONSTITUENCY_MAP: Record<string, string> = {
  'Aberdeen Deeside and North Kincardine': 'Aberdeen South and North Kincardine',
  Airdrie: 'Airdrie and Shotts',
  Bathgate: 'Linlithgow',
  'East Lothian Coast and Lammermuirs': 'East Lothian',
  'Edinburgh Eastern, Musselburgh and Tranent': 'Edinburgh Eastern',
  'Edinburgh North Eastern and Leith': 'Edinburgh Northern and Leith',
  'Edinburgh North Western': 'Edinburgh Western',
  'Edinburgh Northern': 'Edinburgh Central',
  'Edinburgh South Western': 'Edinburgh Pentlands',
  'Falkirk East and Linlithgow': 'Falkirk East',
  'Fife North East': 'North East Fife',
  'Glasgow Baillieston and Shettleston': 'Glasgow Shettleston',
  'Glasgow Cathcart and Pollok': 'Glasgow Pollok',
  'Glasgow Central': 'Glasgow Kelvin',
  'Glasgow Easterhouse and Springburn': 'Glasgow Maryhill and Springburn',
  'Glasgow Kelvin and Maryhill': 'Glasgow Maryhill and Springburn',
  Inverclyde: 'Greenock and Inverclyde',
  'Midlothian North': 'Midlothian North and Musselburgh',
  'Renfrewshire North and Cardonald': 'Renfrewshire North and West',
  'Renfrewshire West and Levern Valley': 'Renfrewshire South',
  'Rutherglen and Cambuslang': 'Rutherglen',
}

export function getScottishConstituencyName(props: Record<string, any> | null | undefined) {
  return String(props?.SPC26NM || props?.SPC22NM || '').trim()
}

export function getScottishConstituencyCode(props: Record<string, any> | null | undefined) {
  return String(props?.SPC26CD || props?.SPC22CD || '').trim()
}

export function getPreviousScottishConstituencyName(name: string) {
  return SCOTLAND_2026_TO_PREVIOUS_CONSTITUENCY_MAP[name] || name
}
