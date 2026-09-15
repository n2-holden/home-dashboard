/**
 * Stick figures for common constellations, using BRIGHT_STARS names.
 * Edges draw only when both endpoints are on-screen above the horizon.
 */

export type ConstellationDef = {
  name: string
  edges: ReadonlyArray<readonly [string, string]>
}

export const CONSTELLATIONS: readonly ConstellationDef[] = [
  {
    name: 'Ursa Major',
    edges: [
      ['Dubhe', 'Merak'],
      ['Merak', 'Phecda'],
      ['Phecda', 'Megrez'],
      ['Megrez', 'Alioth'],
      ['Alioth', 'Mizar'],
      ['Mizar', 'Alkaid'],
      ['Dubhe', 'Megrez'],
    ],
  },
  {
    name: 'Ursa Minor',
    edges: [
      ['Polaris', 'Kochab'],
      ['Kochab', 'Pherkad'],
    ],
  },
  {
    name: 'Orion',
    edges: [
      ['Meissa', 'Betelgeuse'],
      ['Meissa', 'Bellatrix'],
      ['Betelgeuse', 'Bellatrix'],
      ['Bellatrix', 'Mintaka'],
      ['Betelgeuse', 'Alnitak'],
      ['Mintaka', 'Alnilam'],
      ['Alnilam', 'Alnitak'],
      ['Alnitak', 'Saiph'],
      ['Mintaka', 'Rigel'],
      ['Saiph', 'Rigel'],
    ],
  },
  {
    name: 'Cassiopeia',
    edges: [
      ['Caph', 'Schedar'],
      ['Schedar', 'Cih'],
      ['Cih', 'Ruchbah'],
      ['Ruchbah', 'Segin'],
    ],
  },
  {
    name: 'Leo',
    edges: [
      ['Regulus', 'Algieba'],
      ['Algieba', 'Adhafera'],
      ['Algieba', 'Zosma'],
      ['Zosma', 'Chertan'],
      ['Chertan', 'Denebola'],
      ['Regulus', 'Denebola'],
    ],
  },
  {
    name: 'Cygnus',
    edges: [
      ['Deneb', 'Sadr'],
      ['Sadr', 'Gienah'],
      ['Sadr', 'Delta Cygni'],
      ['Sadr', 'Albireo'],
    ],
  },
  {
    name: 'Lyra',
    edges: [
      ['Vega', 'Sheliak'],
      ['Sheliak', 'Sulafat'],
      ['Sulafat', 'Vega'],
    ],
  },
  {
    name: 'Aquila',
    edges: [
      ['Tarazed', 'Altair'],
      ['Altair', 'Alshain'],
      ['Altair', 'Deneb el Okab'],
    ],
  },
  {
    name: 'Taurus',
    edges: [
      ['Elnath', 'Aldebaran'],
      ['Aldebaran', 'Alheka'],
      ['Aldebaran', 'Alcyone'],
    ],
  },
  {
    name: 'Gemini',
    edges: [
      ['Castor', 'Pollux'],
      ['Castor', 'Alhena'],
      ['Pollux', 'Alhena'],
      ['Tejat', 'Mebsuta'],
      ['Mebsuta', 'Alhena'],
    ],
  },
  {
    name: 'Canis Major',
    edges: [
      ['Mirzam', 'Sirius'],
      ['Sirius', 'Adhara'],
      ['Adhara', 'Wezen'],
      ['Wezen', 'Aludra'],
    ],
  },
  {
    name: 'Scorpius',
    edges: [
      ['Graffias', 'Dschubba'],
      ['Dschubba', 'Antares'],
      ['Antares', 'Alniyat'],
      ['Alniyat', 'Tau Scorpii'],
      ['Antares', 'Sargas'],
      ['Sargas', 'Shaula'],
      ['Shaula', 'Lesath'],
    ],
  },
  {
    name: 'Sagittarius',
    edges: [
      ['Kaus Borealis', 'Kaus Media'],
      ['Kaus Media', 'Kaus Australis'],
      ['Kaus Australis', 'Nunki'],
      ['Nunki', 'Ascella'],
      ['Ascella', 'Kaus Media'],
      ['Kaus Borealis', 'Alnasl'],
    ],
  },
  {
    name: 'Pegasus',
    edges: [
      ['Markab', 'Scheat'],
      ['Scheat', 'Alpheratz'],
      ['Alpheratz', 'Algenib'],
      ['Algenib', 'Markab'],
    ],
  },
  {
    name: 'Andromeda',
    edges: [
      ['Alpheratz', 'Mirach'],
      ['Mirach', 'Almach'],
    ],
  },
  {
    name: 'Perseus',
    edges: [
      ['Mirfak', 'Algol'],
      ['Algol', 'Almach'],
    ],
  },
  {
    name: 'Auriga',
    edges: [
      ['Capella', 'Menkalinan'],
      ['Menkalinan', 'Elnath'],
      ['Capella', 'Hassaleh'],
    ],
  },
  {
    name: 'Bootes',
    edges: [
      ['Arcturus', 'Izar'],
      ['Izar', 'Muphrid'],
      ['Arcturus', 'Muphrid'],
      ['Arcturus', 'Seginus'],
    ],
  },
  {
    name: 'Hercules',
    edges: [
      ['Kornephoros', 'Rutilicus'],
      ['Rutilicus', 'Sarin'],
      ['Sarin', 'Pi Herculis'],
    ],
  },
  {
    name: 'Virgo',
    edges: [
      ['Spica', 'Porrima'],
      ['Porrima', 'Vindemiatrix'],
    ],
  },
  {
    name: 'Libra',
    edges: [['Zubenelgenubi', 'Zubeneschamali']],
  },
  {
    name: 'Crux',
    edges: [
      ['Acrux', 'Mimosa'],
      ['Mimosa', 'Gacrux'],
      ['Gacrux', 'Delta Crucis'],
      ['Delta Crucis', 'Acrux'],
    ],
  },
  {
    name: 'Centaurus',
    edges: [
      ['Rigil Kentaurus', 'Hadar'],
      ['Hadar', 'Menkent'],
    ],
  },
  {
    name: 'Summer Triangle',
    edges: [
      ['Vega', 'Deneb'],
      ['Deneb', 'Altair'],
      ['Altair', 'Vega'],
    ],
  },
]

export const CONSTELLATION_EDGES: ReadonlyArray<readonly [string, string]> =
  CONSTELLATIONS.flatMap((c) => c.edges)
