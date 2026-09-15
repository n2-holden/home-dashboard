/**
 * Brightest stars (approx. V magnitude, J2000 RA/Dec), plus constellation anchors.
 * Magnitudes: smaller = brighter.
 */

import { CONSTELLATIONS } from './constellations'

export type BrightStar = {
  name: string
  /** Visual magnitude */
  magnitude: number
  /** Right ascension, degrees */
  raDeg: number
  /** Declination, degrees */
  decDeg: number
  /** Deep-sky objects drawn as ovals instead of dots. */
  kind?: 'star' | 'galaxy'
}

function ra(h: number, m: number, s = 0): number {
  return (h + m / 60 + s / 3600) * 15
}

function dec(sign: 1 | -1, d: number, m: number, s = 0): number {
  return sign * (d + m / 60 + s / 3600)
}

/** Top ~300 brightest stars, plus any extra constellation members. */
export const BRIGHT_STARS: BrightStar[] = [
  { name: 'Sirius', magnitude: -1.46, raDeg: ra(6, 45), decDeg: dec(-1, 16, 42) },
  { name: 'Canopus', magnitude: -0.73, raDeg: ra(6, 24), decDeg: dec(-1, 52, 42) },
  { name: 'Rigil Kentaurus', magnitude: -0.29, raDeg: ra(14, 40), decDeg: dec(-1, 60, 48) },
  { name: 'Arcturus', magnitude: -0.05, raDeg: ra(14, 16), decDeg: dec(1, 19, 12) },
  { name: 'Vega', magnitude: 0.03, raDeg: ra(18, 37), decDeg: dec(1, 38, 48) },
  { name: 'Capella', magnitude: 0.07, raDeg: ra(5, 17), decDeg: dec(1, 46, 0) },
  { name: 'Rigel', magnitude: 0.15, raDeg: ra(5, 15), decDeg: dec(-1, 8, 12) },
  { name: 'Procyon', magnitude: 0.36, raDeg: ra(7, 39), decDeg: dec(1, 5, 12) },
  { name: 'Achernar', magnitude: 0.45, raDeg: ra(1, 38), decDeg: dec(-1, 57, 12) },
  { name: 'Betelgeuse', magnitude: 0.55, raDeg: ra(5, 55), decDeg: dec(1, 7, 24) },
  { name: 'Hadar', magnitude: 0.61, raDeg: ra(14, 4), decDeg: dec(-1, 60, 24) },
  { name: 'Altair', magnitude: 0.77, raDeg: ra(19, 51), decDeg: dec(1, 8, 54) },
  { name: 'Acrux', magnitude: 0.79, raDeg: ra(12, 27), decDeg: dec(-1, 63, 6) },
  { name: 'Aldebaran', magnitude: 0.86, raDeg: ra(4, 36), decDeg: dec(1, 16, 30) },
  { name: 'Antares', magnitude: 0.95, raDeg: ra(16, 29), decDeg: dec(-1, 26, 24) },
  { name: 'Spica', magnitude: 0.97, raDeg: ra(13, 25), decDeg: dec(-1, 11, 12) },
  { name: 'Pollux', magnitude: 1.14, raDeg: ra(7, 45), decDeg: dec(1, 28, 0) },
  { name: 'Fomalhaut', magnitude: 1.15, raDeg: ra(22, 58), decDeg: dec(-1, 29, 36) },
  { name: 'Deneb', magnitude: 1.24, raDeg: ra(20, 41), decDeg: dec(1, 45, 18) },
  { name: 'Mimosa', magnitude: 1.26, raDeg: ra(12, 48), decDeg: dec(-1, 59, 42) },
  { name: 'Regulus', magnitude: 1.36, raDeg: ra(10, 8), decDeg: dec(1, 12, 0) },
  { name: 'Adhara', magnitude: 1.5, raDeg: ra(6, 59), decDeg: dec(-1, 29, 0) },
  { name: 'Castor', magnitude: 1.58, raDeg: ra(7, 35), decDeg: dec(1, 31, 54) },
  { name: 'Shaula', magnitude: 1.62, raDeg: ra(17, 34), decDeg: dec(-1, 37, 6) },
  { name: 'Gacrux', magnitude: 1.63, raDeg: ra(12, 31), decDeg: dec(-1, 57, 6) },
  { name: 'Bellatrix', magnitude: 1.64, raDeg: ra(5, 25), decDeg: dec(1, 6, 18) },
  { name: 'Elnath', magnitude: 1.66, raDeg: ra(5, 26), decDeg: dec(1, 28, 36) },
  { name: 'Miaplacidus', magnitude: 1.67, raDeg: ra(9, 13), decDeg: dec(-1, 69, 42) },
  { name: 'Alnilam', magnitude: 1.69, raDeg: ra(5, 36), decDeg: dec(-1, 1, 12) },
  { name: 'Alnair', magnitude: 1.74, raDeg: ra(22, 8), decDeg: dec(-1, 47, 0) },
  { name: 'Alnitak', magnitude: 1.75, raDeg: ra(5, 41), decDeg: dec(-1, 1, 54) },
  { name: 'Alioth', magnitude: 1.77, raDeg: ra(12, 54), decDeg: dec(1, 56, 0) },
  { name: 'Mirfak', magnitude: 1.8, raDeg: ra(3, 24), decDeg: dec(1, 49, 54) },
  { name: 'Dubhe', magnitude: 1.8, raDeg: ra(11, 4), decDeg: dec(1, 61, 48) },
  { name: 'Regor', magnitude: 1.81, raDeg: ra(8, 10), decDeg: dec(-1, 47, 18) },
  { name: 'Wezen', magnitude: 1.83, raDeg: ra(7, 8), decDeg: dec(-1, 26, 24) },
  { name: 'Kaus Australis', magnitude: 1.84, raDeg: ra(18, 24), decDeg: dec(-1, 34, 24) },
  { name: 'Alkaid', magnitude: 1.86, raDeg: ra(13, 48), decDeg: dec(1, 49, 18) },
  { name: 'Sargas', magnitude: 1.86, raDeg: ra(17, 37), decDeg: dec(-1, 43, 0) },
  { name: 'Avior', magnitude: 1.87, raDeg: ra(8, 23), decDeg: dec(-1, 59, 30) },
  { name: 'Menkalinan', magnitude: 1.9, raDeg: ra(6, 0), decDeg: dec(1, 44, 54) },
  { name: 'Atria', magnitude: 1.92, raDeg: ra(16, 49), decDeg: dec(-1, 69, 0) },
  { name: 'Alhena', magnitude: 1.93, raDeg: ra(6, 38), decDeg: dec(1, 16, 24) },
  { name: 'Peacock', magnitude: 1.93, raDeg: ra(20, 26), decDeg: dec(-1, 56, 42) },
  { name: 'Alsephina', magnitude: 1.95, raDeg: ra(8, 45), decDeg: dec(-1, 54, 42) },
  { name: 'Mirzam', magnitude: 1.98, raDeg: ra(6, 23), decDeg: dec(-1, 18, 0) },
  { name: 'Alphard', magnitude: 1.98, raDeg: ra(9, 28), decDeg: dec(-1, 8, 42) },
  { name: 'Polaris', magnitude: 1.99, raDeg: ra(2, 32), decDeg: dec(1, 89, 18) },
  { name: 'Algieba', magnitude: 2, raDeg: ra(10, 20), decDeg: dec(1, 19, 48) },
  { name: 'Hamal', magnitude: 2.01, raDeg: ra(2, 7), decDeg: dec(1, 23, 30) },
  { name: 'Diphda', magnitude: 2.04, raDeg: ra(0, 44), decDeg: dec(-1, 18, 0) },
  { name: 'Nunki', magnitude: 2.05, raDeg: ra(18, 55), decDeg: dec(-1, 26, 18) },
  { name: 'Menkent', magnitude: 2.06, raDeg: ra(14, 7), decDeg: dec(-1, 36, 24) },
  { name: 'Alpheratz', magnitude: 2.07, raDeg: ra(0, 8), decDeg: dec(1, 29, 6) },
  { name: 'Mirach', magnitude: 2.07, raDeg: ra(1, 10), decDeg: dec(1, 35, 36) },
  { name: 'Saiph', magnitude: 2.07, raDeg: ra(5, 48), decDeg: dec(-1, 9, 42) },
  { name: 'Kochab', magnitude: 2.07, raDeg: ra(14, 51), decDeg: dec(1, 74, 12) },
  { name: 'Al Dhanab', magnitude: 2.07, raDeg: ra(22, 43), decDeg: dec(-1, 46, 54) },
  { name: 'Rasalhague', magnitude: 2.08, raDeg: ra(17, 35), decDeg: dec(1, 12, 36) },
  { name: 'Algol', magnitude: 2.09, raDeg: ra(3, 8), decDeg: dec(1, 41, 0) },
  { name: 'Almach', magnitude: 2.1, raDeg: ra(2, 4), decDeg: dec(1, 42, 18) },
  { name: 'Denebola', magnitude: 2.14, raDeg: ra(11, 49), decDeg: dec(1, 14, 36) },
  { name: 'Cih', magnitude: 2.15, raDeg: ra(0, 57), decDeg: dec(1, 60, 42) },
  { name: 'Muhlifain', magnitude: 2.2, raDeg: ra(12, 42), decDeg: dec(-1, 49, 0) },
  { name: 'Naos', magnitude: 2.21, raDeg: ra(8, 4), decDeg: dec(-1, 40, 0) },
  { name: 'Aspidiske', magnitude: 2.21, raDeg: ra(9, 17), decDeg: dec(-1, 59, 18) },
  { name: 'Alphecca', magnitude: 2.22, raDeg: ra(15, 35), decDeg: dec(1, 26, 42) },
  { name: 'Suhail', magnitude: 2.23, raDeg: ra(9, 8), decDeg: dec(-1, 43, 24) },
  { name: 'Mizar', magnitude: 2.23, raDeg: ra(13, 24), decDeg: dec(1, 54, 54) },
  { name: 'Sadr', magnitude: 2.23, raDeg: ra(20, 22), decDeg: dec(1, 40, 18) },
  { name: 'Schedar', magnitude: 2.24, raDeg: ra(0, 41), decDeg: dec(1, 56, 30) },
  { name: 'Eltanin', magnitude: 2.24, raDeg: ra(17, 57), decDeg: dec(1, 51, 30) },
  { name: 'Mintaka', magnitude: 2.25, raDeg: ra(5, 32), decDeg: dec(-1, 0, 18) },
  { name: 'Caph', magnitude: 2.28, raDeg: ra(0, 9), decDeg: dec(1, 59, 12) },
  { name: 'Epsilon Centauri', magnitude: 2.29, raDeg: ra(13, 40), decDeg: dec(-1, 53, 30) },
  { name: 'Dschubba', magnitude: 2.29, raDeg: ra(16, 0), decDeg: dec(-1, 22, 36) },
  { name: 'Wei', magnitude: 2.29, raDeg: ra(16, 50), decDeg: dec(-1, 34, 18) },
  { name: 'Men', magnitude: 2.3, raDeg: ra(14, 42), decDeg: dec(-1, 47, 24) },
  { name: 'Eta Centauri', magnitude: 2.33, raDeg: ra(14, 36), decDeg: dec(-1, 42, 12) },
  { name: 'Merak', magnitude: 2.34, raDeg: ra(11, 2), decDeg: dec(1, 56, 24) },
  { name: 'Izar', magnitude: 2.35, raDeg: ra(14, 45), decDeg: dec(1, 27, 6) },
  { name: 'Enif', magnitude: 2.38, raDeg: ra(21, 44), decDeg: dec(1, 9, 54) },
  { name: 'Girtab', magnitude: 2.39, raDeg: ra(17, 42), decDeg: dec(-1, 39, 0) },
  { name: 'Ankaa', magnitude: 2.4, raDeg: ra(0, 26), decDeg: dec(-1, 42, 18) },
  { name: 'Phecda', magnitude: 2.41, raDeg: ra(11, 54), decDeg: dec(1, 53, 42) },
  { name: 'Sabik', magnitude: 2.43, raDeg: ra(17, 10), decDeg: dec(-1, 15, 42) },
  { name: 'Scheat', magnitude: 2.44, raDeg: ra(23, 4), decDeg: dec(1, 28, 6) },
  { name: 'Aludra', magnitude: 2.45, raDeg: ra(7, 24), decDeg: dec(-1, 29, 18) },
  { name: 'Alderamin', magnitude: 2.45, raDeg: ra(21, 19), decDeg: dec(1, 62, 36) },
  { name: 'Markeb', magnitude: 2.47, raDeg: ra(9, 22), decDeg: dec(-1, 55, 0) },
  { name: 'Gienah', magnitude: 2.48, raDeg: ra(20, 46), decDeg: dec(1, 34, 0) },
  { name: 'Markab', magnitude: 2.49, raDeg: ra(23, 5), decDeg: dec(1, 15, 12) },
  { name: 'Menkar', magnitude: 2.54, raDeg: ra(3, 2), decDeg: dec(1, 4, 6) },
  { name: 'Han', magnitude: 2.54, raDeg: ra(16, 37), decDeg: dec(-1, 10, 36) },
  { name: 'Zeta Centauri', magnitude: 2.55, raDeg: ra(13, 56), decDeg: dec(-1, 47, 18) },
  { name: 'Zosma', magnitude: 2.56, raDeg: ra(11, 14), decDeg: dec(1, 20, 30) },
  { name: 'Graffias', magnitude: 2.56, raDeg: ra(16, 5), decDeg: dec(-1, 19, 48) },
  { name: 'Arneb', magnitude: 2.58, raDeg: ra(5, 33), decDeg: dec(-1, 17, 48) },
  { name: 'Delta Centauri', magnitude: 2.58, raDeg: ra(12, 8), decDeg: dec(-1, 50, 42) },
  { name: 'Gienah Corvi', magnitude: 2.58, raDeg: ra(12, 16), decDeg: dec(-1, 17, 30) },
  { name: 'Ascella', magnitude: 2.6, raDeg: ra(19, 3), decDeg: dec(-1, 29, 54) },
  { name: 'Zubeneschamali', magnitude: 2.61, raDeg: ra(15, 17), decDeg: dec(-1, 9, 24) },
  { name: 'Unukalhai', magnitude: 2.63, raDeg: ra(15, 44), decDeg: dec(1, 6, 24) },
  { name: 'Sheratan', magnitude: 2.64, raDeg: ra(1, 55), decDeg: dec(1, 20, 48) },
  { name: 'Zubenelgenubi', magnitude: 2.64, raDeg: ra(14, 51), decDeg: dec(-1, 16, 0) },
  { name: 'Phact', magnitude: 2.65, raDeg: ra(5, 40), decDeg: dec(-1, 34, 6) },
  { name: 'Theta Aurigae', magnitude: 2.65, raDeg: ra(6, 0), decDeg: dec(1, 37, 12) },
  { name: 'Kraz', magnitude: 2.65, raDeg: ra(12, 34), decDeg: dec(-1, 23, 24) },
  { name: 'Ruchbah', magnitude: 2.66, raDeg: ra(1, 26), decDeg: dec(1, 60, 12) },
  { name: 'Muphrid', magnitude: 2.68, raDeg: ra(13, 55), decDeg: dec(1, 18, 24) },
  { name: 'Ke Kouan', magnitude: 2.68, raDeg: ra(14, 59), decDeg: dec(-1, 43, 6) },
  { name: 'Hassaleh', magnitude: 2.69, raDeg: ra(4, 57), decDeg: dec(1, 33, 12) },
  { name: 'Mu Velorum', magnitude: 2.69, raDeg: ra(10, 47), decDeg: dec(-1, 49, 24) },
  { name: 'Alpha Muscae', magnitude: 2.69, raDeg: ra(12, 37), decDeg: dec(-1, 69, 6) },
  { name: 'Lesath', magnitude: 2.7, raDeg: ra(17, 31), decDeg: dec(-1, 37, 18) },
  { name: 'Pi Puppis', magnitude: 2.71, raDeg: ra(7, 17), decDeg: dec(-1, 37, 6) },
  { name: 'Kaus Media', magnitude: 2.72, raDeg: ra(18, 21), decDeg: dec(-1, 29, 48) },
  { name: 'Tarazed', magnitude: 2.72, raDeg: ra(19, 46), decDeg: dec(1, 10, 36) },
  { name: 'Yed Prior', magnitude: 2.73, raDeg: ra(16, 14), decDeg: dec(-1, 3, 42) },
  { name: 'Aldhibain', magnitude: 2.73, raDeg: ra(16, 24), decDeg: dec(1, 61, 30) },
  { name: 'Theta Carinae', magnitude: 2.74, raDeg: ra(10, 43), decDeg: dec(-1, 64, 24) },
  { name: 'Porrima', magnitude: 2.74, raDeg: ra(12, 42), decDeg: dec(-1, 1, 30) },
  { name: 'Hatysa', magnitude: 2.75, raDeg: ra(5, 35), decDeg: dec(-1, 5, 54) },
  { name: 'Iota Centauri', magnitude: 2.75, raDeg: ra(13, 21), decDeg: dec(-1, 36, 42) },
  { name: 'Cebalrai', magnitude: 2.76, raDeg: ra(17, 43), decDeg: dec(1, 4, 36) },
  { name: 'Kursa', magnitude: 2.78, raDeg: ra(5, 8), decDeg: dec(-1, 5, 6) },
  { name: 'Kornephoros', magnitude: 2.78, raDeg: ra(16, 30), decDeg: dec(1, 21, 30) },
  { name: 'Delta Crucis', magnitude: 2.79, raDeg: ra(12, 15), decDeg: dec(-1, 58, 42) },
  { name: 'Rastaban', magnitude: 2.79, raDeg: ra(17, 30), decDeg: dec(1, 52, 18) },
  { name: 'Cor Caroli', magnitude: 2.8, raDeg: ra(12, 56), decDeg: dec(1, 38, 18) },
  { name: 'Gamma Lupi', magnitude: 2.8, raDeg: ra(15, 35), decDeg: dec(-1, 41, 12) },
  { name: 'Nihal', magnitude: 2.81, raDeg: ra(5, 28), decDeg: dec(-1, 20, 48) },
  { name: 'Rutilicus', magnitude: 2.81, raDeg: ra(16, 41), decDeg: dec(1, 31, 36) },
  { name: 'Beta Hydri', magnitude: 2.82, raDeg: ra(0, 26), decDeg: dec(-1, 77, 18) },
  { name: 'Tau Scorpii', magnitude: 2.82, raDeg: ra(16, 36), decDeg: dec(-1, 28, 12) },
  { name: 'Kaus Borealis', magnitude: 2.82, raDeg: ra(18, 28), decDeg: dec(-1, 25, 24) },
  { name: 'Algenib', magnitude: 2.83, raDeg: ra(0, 13), decDeg: dec(1, 15, 12) },
  { name: 'Turais', magnitude: 2.83, raDeg: ra(8, 8), decDeg: dec(-1, 24, 18) },
  { name: 'Beta Trianguli Australis', magnitude: 2.83, raDeg: ra(15, 55), decDeg: dec(-1, 63, 24) },
  { name: 'Zeta Persei', magnitude: 2.84, raDeg: ra(3, 54), decDeg: dec(1, 31, 54) },
  { name: 'Beta Arae', magnitude: 2.84, raDeg: ra(17, 25), decDeg: dec(-1, 55, 30) },
  { name: 'Choo', magnitude: 2.84, raDeg: ra(17, 32), decDeg: dec(-1, 49, 54) },
  { name: 'Alcyone', magnitude: 2.85, raDeg: ra(3, 47), decDeg: dec(1, 24, 6) },
  { name: 'Vindemiatrix', magnitude: 2.85, raDeg: ra(13, 2), decDeg: dec(1, 11, 0) },
  { name: 'Deneb Algedi', magnitude: 2.85, raDeg: ra(21, 47), decDeg: dec(-1, 16, 6) },
  { name: 'Alpha Hydri', magnitude: 2.86, raDeg: ra(1, 59), decDeg: dec(-1, 61, 36) },
  { name: 'Delta Cygni', magnitude: 2.86, raDeg: ra(19, 45), decDeg: dec(1, 45, 6) },
  { name: 'Tejat', magnitude: 2.87, raDeg: ra(6, 23), decDeg: dec(1, 22, 30) },
  { name: 'Gamma Trianguli Australis', magnitude: 2.87, raDeg: ra(15, 19), decDeg: dec(-1, 68, 42) },
  { name: 'Alpha Tucanae', magnitude: 2.87, raDeg: ra(22, 19), decDeg: dec(-1, 60, 18) },
  { name: 'Acamar', magnitude: 2.88, raDeg: ra(2, 58), decDeg: dec(-1, 40, 18) },
  { name: 'Albaldah', magnitude: 2.88, raDeg: ra(19, 10), decDeg: dec(-1, 21, 0) },
  { name: 'Gomeisa', magnitude: 2.89, raDeg: ra(7, 27), decDeg: dec(1, 8, 18) },
  { name: 'Pi Scorpii', magnitude: 2.89, raDeg: ra(15, 59), decDeg: dec(-1, 26, 6) },
  { name: 'Epsilon Persei', magnitude: 2.9, raDeg: ra(3, 58), decDeg: dec(1, 40, 0) },
  { name: 'Alniyat', magnitude: 2.9, raDeg: ra(16, 21), decDeg: dec(-1, 25, 36) },
  { name: 'Albireo', magnitude: 2.9, raDeg: ra(19, 31), decDeg: dec(1, 28, 0) },
  { name: 'Sadalsuud', magnitude: 2.9, raDeg: ra(21, 32), decDeg: dec(-1, 5, 36) },
  { name: 'Gamma Persei', magnitude: 2.91, raDeg: ra(3, 5), decDeg: dec(1, 53, 30) },
  { name: 'Upsilon Carinae', magnitude: 2.92, raDeg: ra(9, 47), decDeg: dec(-1, 65, 6) },
  { name: 'Matar', magnitude: 2.93, raDeg: ra(22, 43), decDeg: dec(1, 30, 12) },
  { name: 'Tau Puppis', magnitude: 2.94, raDeg: ra(6, 50), decDeg: dec(-1, 50, 36) },
  { name: 'Algorel', magnitude: 2.94, raDeg: ra(12, 30), decDeg: dec(-1, 16, 30) },
  { name: 'Sadalmelik', magnitude: 2.95, raDeg: ra(22, 6), decDeg: dec(-1, 0, 18) },
  { name: 'Zaurak', magnitude: 2.97, raDeg: ra(3, 58), decDeg: dec(-1, 13, 30) },
  { name: 'Alheka', magnitude: 2.97, raDeg: ra(5, 38), decDeg: dec(1, 21, 6) },
  { name: 'Ras Elased Australis', magnitude: 2.97, raDeg: ra(9, 46), decDeg: dec(1, 23, 48) },
  { name: 'Alnasl', magnitude: 2.98, raDeg: ra(18, 6), decDeg: dec(-1, 30, 24) },
  { name: 'Gamma Hydrae', magnitude: 2.99, raDeg: ra(13, 19), decDeg: dec(-1, 23, 12) },
  { name: 'Iota Scorpii', magnitude: 2.99, raDeg: ra(17, 48), decDeg: dec(-1, 40, 6) },
  { name: 'Deneb el Okab', magnitude: 2.99, raDeg: ra(19, 5), decDeg: dec(1, 13, 54) },
  { name: 'Beta Trianguli', magnitude: 3, raDeg: ra(2, 10), decDeg: dec(1, 35, 0) },
  { name: 'Psi Ursae Majoris', magnitude: 3, raDeg: ra(11, 10), decDeg: dec(1, 44, 30) },
  { name: 'Pherkad', magnitude: 3, raDeg: ra(15, 21), decDeg: dec(1, 71, 48) },
  { name: 'Mu Scorpii', magnitude: 3, raDeg: ra(16, 52), decDeg: dec(-1, 38, 0) },
  { name: 'Gamma Gruis', magnitude: 3, raDeg: ra(21, 54), decDeg: dec(-1, 37, 24) },
  { name: 'Delta Persei', magnitude: 3.01, raDeg: ra(3, 43), decDeg: dec(1, 47, 48) },
  { name: 'Phurad', magnitude: 3.02, raDeg: ra(6, 20), decDeg: dec(-1, 30, 6) },
  { name: 'Omicron² Canis Majoris', magnitude: 3.02, raDeg: ra(7, 3), decDeg: dec(-1, 23, 48) },
  { name: 'Minkar', magnitude: 3.02, raDeg: ra(12, 10), decDeg: dec(-1, 22, 36) },
  { name: 'Almaaz', magnitude: 3.03, raDeg: ra(5, 2), decDeg: dec(1, 43, 48) },
  { name: 'Beta Muscae', magnitude: 3.04, raDeg: ra(12, 46), decDeg: dec(-1, 68, 6) },
  { name: 'Seginus', magnitude: 3.04, raDeg: ra(14, 32), decDeg: dec(1, 38, 18) },
  { name: 'Dabih', magnitude: 3.05, raDeg: ra(20, 21), decDeg: dec(-1, 14, 48) },
  { name: 'Mebsuta', magnitude: 3.06, raDeg: ra(6, 44), decDeg: dec(1, 25, 6) },
  { name: 'Tania Australis', magnitude: 3.06, raDeg: ra(10, 22), decDeg: dec(1, 41, 30) },
  { name: 'Tais', magnitude: 3.07, raDeg: ra(19, 13), decDeg: dec(1, 67, 42) },
  { name: 'Eta Sagittarii', magnitude: 3.1, raDeg: ra(18, 18), decDeg: dec(-1, 36, 48) },
  { name: 'Zeta Hydrae', magnitude: 3.11, raDeg: ra(8, 55), decDeg: dec(1, 5, 54) },
  { name: 'Nu Hydrae', magnitude: 3.11, raDeg: ra(10, 50), decDeg: dec(-1, 16, 12) },
  { name: 'Lambda Centauri', magnitude: 3.11, raDeg: ra(11, 36), decDeg: dec(-1, 63, 0) },
  { name: 'Persian', magnitude: 3.11, raDeg: ra(20, 38), decDeg: dec(-1, 47, 18) },
  { name: 'Wazn', magnitude: 3.12, raDeg: ra(5, 51), decDeg: dec(-1, 35, 48) },
  { name: 'Talita', magnitude: 3.12, raDeg: ra(8, 59), decDeg: dec(1, 48, 0) },
  { name: 'Zeta Arae', magnitude: 3.12, raDeg: ra(16, 59), decDeg: dec(-1, 56, 0) },
  { name: 'Sarin', magnitude: 3.12, raDeg: ra(17, 15), decDeg: dec(1, 24, 48) },
  { name: 'Ke Kwan', magnitude: 3.13, raDeg: ra(14, 59), decDeg: dec(-1, 42, 6) },
  { name: 'Alpha Lyncis', magnitude: 3.14, raDeg: ra(9, 21), decDeg: dec(1, 34, 24) },
  { name: 'N Velorum', magnitude: 3.16, raDeg: ra(9, 31), decDeg: dec(-1, 57, 0) },
  { name: 'Pi Herculis', magnitude: 3.16, raDeg: ra(17, 15), decDeg: dec(1, 36, 48) },
  { name: 'Nu Puppis', magnitude: 3.17, raDeg: ra(6, 38), decDeg: dec(-1, 43, 12) },
  { name: 'Al Haud', magnitude: 3.17, raDeg: ra(9, 33), decDeg: dec(1, 51, 42) },
  { name: 'Aldhibah', magnitude: 3.17, raDeg: ra(17, 9), decDeg: dec(1, 65, 42) },
  { name: 'Phi Sagittarii', magnitude: 3.17, raDeg: ra(18, 46), decDeg: dec(-1, 27, 0) },
  { name: 'Hoedus II', magnitude: 3.18, raDeg: ra(5, 7), decDeg: dec(1, 41, 12) },
  { name: 'Alpha Circini', magnitude: 3.18, raDeg: ra(14, 43), decDeg: dec(-1, 65, 0) },
  { name: 'Tabit', magnitude: 3.19, raDeg: ra(4, 50), decDeg: dec(1, 7, 0) },
  { name: 'Epsilon Leporis', magnitude: 3.19, raDeg: ra(5, 5), decDeg: dec(-1, 22, 24) },
  { name: 'Kappa Ophiuchi', magnitude: 3.19, raDeg: ra(16, 58), decDeg: dec(1, 9, 24) },
  { name: 'G Scorpii', magnitude: 3.19, raDeg: ra(17, 50), decDeg: dec(-1, 37, 0) },
  { name: 'Zeta Cygni', magnitude: 3.21, raDeg: ra(21, 13), decDeg: dec(1, 30, 12) },
  { name: 'Errai', magnitude: 3.21, raDeg: ra(23, 39), decDeg: dec(1, 77, 36) },
  { name: 'Delta Lupi', magnitude: 3.22, raDeg: ra(15, 21), decDeg: dec(-1, 40, 36) },
  { name: 'Yed Posterior', magnitude: 3.23, raDeg: ra(16, 18), decDeg: dec(-1, 4, 42) },
  { name: 'Alava', magnitude: 3.23, raDeg: ra(18, 21), decDeg: dec(-1, 2, 54) },
  { name: 'Alphirk', magnitude: 3.23, raDeg: ra(21, 29), decDeg: dec(1, 70, 36) },
  { name: 'Alpha Pictoris', magnitude: 3.24, raDeg: ra(6, 48), decDeg: dec(-1, 61, 54) },
  { name: 'Theta Aquilae', magnitude: 3.24, raDeg: ra(20, 11), decDeg: dec(-1, 0, 48) },
  { name: 'Sigma Puppis', magnitude: 3.25, raDeg: ra(7, 29), decDeg: dec(-1, 43, 18) },
  { name: 'Pi Hydrae', magnitude: 3.25, raDeg: ra(14, 6), decDeg: dec(-1, 26, 42) },
  { name: 'Brachium', magnitude: 3.25, raDeg: ra(15, 4), decDeg: dec(-1, 25, 18) },
  { name: 'Sulafat', magnitude: 3.25, raDeg: ra(18, 59), decDeg: dec(1, 32, 42) },
  { name: 'Gamma Hydri', magnitude: 3.26, raDeg: ra(3, 47), decDeg: dec(-1, 74, 12) },
  { name: 'Delta Andromedae', magnitude: 3.27, raDeg: ra(0, 39), decDeg: dec(1, 30, 54) },
  { name: 'Theta Ophiuchi', magnitude: 3.27, raDeg: ra(17, 22), decDeg: dec(-1, 25, 0) },
  { name: 'Skat', magnitude: 3.27, raDeg: ra(22, 55), decDeg: dec(-1, 15, 48) },
  { name: 'Mu Leporis', magnitude: 3.29, raDeg: ra(5, 13), decDeg: dec(-1, 16, 12) },
  { name: 'Omega Carinae', magnitude: 3.29, raDeg: ra(10, 14), decDeg: dec(-1, 70, 0) },
  { name: 'Edasich', magnitude: 3.29, raDeg: ra(15, 25), decDeg: dec(1, 59, 0) },
  { name: 'Alpha Doradus', magnitude: 3.3, raDeg: ra(4, 34), decDeg: dec(-1, 55, 0) },
  { name: 'p Carinae', magnitude: 3.3, raDeg: ra(10, 32), decDeg: dec(-1, 61, 42) },
  { name: 'Mu Centauri', magnitude: 3.3, raDeg: ra(13, 50), decDeg: dec(-1, 42, 30) },
  { name: 'Propus', magnitude: 3.31, raDeg: ra(6, 15), decDeg: dec(1, 22, 30) },
  { name: 'Rasalgethi', magnitude: 3.31, raDeg: ra(17, 15), decDeg: dec(1, 14, 24) },
  { name: 'Gamma Arae', magnitude: 3.31, raDeg: ra(17, 25), decDeg: dec(-1, 56, 24) },
  { name: 'Beta Phoenicis', magnitude: 3.32, raDeg: ra(1, 6), decDeg: dec(-1, 46, 42) },
  { name: 'Gorgonea Tertia', magnitude: 3.32, raDeg: ra(3, 5), decDeg: dec(1, 38, 48) },
  { name: 'Megrez', magnitude: 3.32, raDeg: ra(12, 15), decDeg: dec(1, 57, 0) },
  { name: 'Eta Scorpii', magnitude: 3.32, raDeg: ra(17, 12), decDeg: dec(-1, 43, 12) },
  { name: 'Nu Ophiuchi', magnitude: 3.32, raDeg: ra(17, 59), decDeg: dec(-1, 9, 48) },
  { name: 'Tau Sagittarii', magnitude: 3.32, raDeg: ra(19, 7), decDeg: dec(-1, 27, 42) },
  { name: 'Alpha Reticuli', magnitude: 3.33, raDeg: ra(4, 14), decDeg: dec(-1, 62, 30) },
  { name: 'Chertan', magnitude: 3.33, raDeg: ra(11, 14), decDeg: dec(1, 15, 24) },
  { name: 'Asmidiske', magnitude: 3.34, raDeg: ra(7, 49), decDeg: dec(-1, 24, 54) },
  { name: 'Segin', magnitude: 3.35, raDeg: ra(1, 54), decDeg: dec(1, 63, 42) },
  { name: 'Algjebbah', magnitude: 3.35, raDeg: ra(5, 24), decDeg: dec(-1, 2, 24) },
  { name: 'Alzirr', magnitude: 3.35, raDeg: ra(6, 45), decDeg: dec(1, 12, 54) },
  { name: 'Muscida', magnitude: 3.35, raDeg: ra(8, 30), decDeg: dec(1, 60, 42) },
  { name: 'Delta Aquilae', magnitude: 3.36, raDeg: ra(19, 25), decDeg: dec(1, 3, 6) },
  { name: 'Epsilon Lupi', magnitude: 3.37, raDeg: ra(15, 23), decDeg: dec(-1, 44, 42) },
  { name: 'Heze', magnitude: 3.38, raDeg: ra(13, 35), decDeg: dec(-1, 0, 36) },
  { name: 'Epsilon Hydrae', magnitude: 3.38, raDeg: ra(8, 47), decDeg: dec(1, 6, 24) },
  { name: 'Meissa', magnitude: 3.39, raDeg: ra(5, 35), decDeg: dec(1, 9, 54) },
  { name: 'q Carinae', magnitude: 3.39, raDeg: ra(10, 17), decDeg: dec(-1, 61, 18) },
  { name: 'Auva', magnitude: 3.39, raDeg: ra(12, 56), decDeg: dec(1, 3, 24) },
  { name: 'Zeta Cephei', magnitude: 3.39, raDeg: ra(22, 11), decDeg: dec(1, 58, 12) },
  { name: 'Theta² Tauri', magnitude: 3.4, raDeg: ra(4, 29), decDeg: dec(1, 15, 54) },
  { name: 'Gamma Phoenicis', magnitude: 3.41, raDeg: ra(1, 28), decDeg: dec(-1, 43, 18) },
  { name: 'Lambda Tauri', magnitude: 3.41, raDeg: ra(4, 1), decDeg: dec(1, 12, 30) },
  { name: 'Nu Centauri', magnitude: 3.41, raDeg: ra(13, 50), decDeg: dec(-1, 41, 42) },
  { name: 'Zeta Lupi', magnitude: 3.41, raDeg: ra(15, 12), decDeg: dec(-1, 52, 6) },
  { name: 'Eta Cephei', magnitude: 3.41, raDeg: ra(20, 45), decDeg: dec(1, 61, 48) },
  { name: 'Homam', magnitude: 3.41, raDeg: ra(22, 41), decDeg: dec(1, 10, 48) },
  { name: 'Mothallah', magnitude: 3.42, raDeg: ra(1, 53), decDeg: dec(1, 29, 36) },
  { name: 'Eta Lupi', magnitude: 3.42, raDeg: ra(16, 0), decDeg: dec(-1, 38, 24) },
  { name: 'Mu Herculis', magnitude: 3.42, raDeg: ra(17, 46), decDeg: dec(1, 27, 42) },
  { name: 'Beta Pavonis', magnitude: 3.42, raDeg: ra(20, 45), decDeg: dec(-1, 66, 12) },
  { name: 'a Carinae', magnitude: 3.43, raDeg: ra(9, 11), decDeg: dec(-1, 58, 54) },
  { name: 'Adhafera', magnitude: 3.43, raDeg: ra(10, 17), decDeg: dec(1, 23, 24) },
  { name: 'Althalimain', magnitude: 3.43, raDeg: ra(19, 6), decDeg: dec(-1, 4, 54) },
  { name: 'Tania Borealis', magnitude: 3.45, raDeg: ra(10, 17), decDeg: dec(1, 42, 54) },
  { name: 'Sheliak', magnitude: 3.45, raDeg: ra(18, 50), decDeg: dec(1, 33, 24) },
  { name: 'Achird', magnitude: 3.46, raDeg: ra(0, 49), decDeg: dec(1, 57, 48) },
  { name: 'Dheneb', magnitude: 3.46, raDeg: ra(1, 9), decDeg: dec(-1, 10, 12) },
  { name: 'Chi Carinae', magnitude: 3.46, raDeg: ra(7, 57), decDeg: dec(-1, 53, 0) },
  { name: 'Delta Bootis', magnitude: 3.46, raDeg: ra(15, 16), decDeg: dec(1, 33, 18) },
  { name: 'Kaffaljidhma', magnitude: 3.47, raDeg: ra(2, 43), decDeg: dec(1, 3, 12) },
  { name: 'Eta Leonis', magnitude: 3.48, raDeg: ra(10, 7), decDeg: dec(1, 16, 48) },
  { name: 'Eta Herculis', magnitude: 3.48, raDeg: ra(16, 43), decDeg: dec(1, 38, 54) },
  { name: 'Tau Ceti', magnitude: 3.49, raDeg: ra(1, 44), decDeg: dec(-1, 15, 54) },
  { name: 'Sigma Canis Majoris', magnitude: 3.49, raDeg: ra(7, 2), decDeg: dec(-1, 27, 54) },
  { name: 'Alula Borealis', magnitude: 3.49, raDeg: ra(11, 18), decDeg: dec(1, 33, 6) },
  { name: 'Nekkar', magnitude: 3.49, raDeg: ra(15, 2), decDeg: dec(1, 40, 24) },
  { name: 'Alpha Telescopii', magnitude: 3.49, raDeg: ra(18, 27), decDeg: dec(-1, 46, 0) },
  { name: 'Epsilon Gruis', magnitude: 3.49, raDeg: ra(22, 49), decDeg: dec(-1, 51, 18) },
  { name: 'Kappa Canis Majoris', magnitude: 3.5, raDeg: ra(6, 50), decDeg: dec(-1, 32, 30) },
  { name: 'Wasat', magnitude: 3.5, raDeg: ra(7, 20), decDeg: dec(1, 22, 0) },
  { name: 'Iota Cephei', magnitude: 3.5, raDeg: ra(22, 50), decDeg: dec(1, 66, 12) },
  { name: 'Gamma Sagittae', magnitude: 3.51, raDeg: ra(19, 59), decDeg: dec(1, 19, 30) },
  { name: 'Sadalbari', magnitude: 3.51, raDeg: ra(22, 50), decDeg: dec(1, 24, 36) },
  { name: 'Rana', magnitude: 3.52, raDeg: ra(3, 43), decDeg: dec(-1, 9, 48) },
  { name: 'Subra', magnitude: 3.52, raDeg: ra(9, 41), decDeg: dec(1, 9, 54) },
  { name: 'Tseen Ke', magnitude: 3.52, raDeg: ra(9, 57), decDeg: dec(-1, 54, 36) },
  { name: 'Xi² Sagittarii', magnitude: 3.52, raDeg: ra(18, 58), decDeg: dec(-1, 21, 6) },
  { name: 'Baham', magnitude: 3.52, raDeg: ra(22, 10), decDeg: dec(1, 6, 12) },
  { name: 'Ain', magnitude: 3.53, raDeg: ra(4, 29), decDeg: dec(1, 19, 12) },
  { name: 'Tarf', magnitude: 3.53, raDeg: ra(8, 17), decDeg: dec(1, 9, 12) },
  { name: 'Xi Hydrae', magnitude: 3.54, raDeg: ra(11, 33), decDeg: dec(-1, 31, 54) },
  { name: 'Mu Serpentis', magnitude: 3.54, raDeg: ra(15, 50), decDeg: dec(-1, 3, 24) },
  { name: 'Xi Serpentis', magnitude: 3.54, raDeg: ra(17, 38), decDeg: dec(-1, 15, 24) },
  { name: 'Alshain', magnitude: 3.71, raDeg: ra(19, 55), decDeg: dec(1, 6, 24) },
  { name: 'Andromeda', magnitude: 3.44, raDeg: ra(0, 42, 44), decDeg: dec(1, 41, 16), kind: 'galaxy' },
]

/** Names eligible for on-chart Labels: top 100 + Andromeda + constellation members. */
export const STAR_LABEL_NAMES: ReadonlySet<string> = (() => {
  const names = new Set<string>()
  const ranked = [...BRIGHT_STARS]
    .filter((star) => (star.kind ?? 'star') !== 'galaxy')
    .sort((a, b) => a.magnitude - b.magnitude)
  for (const star of ranked.slice(0, 100)) names.add(star.name)
  names.add('Andromeda')
  for (const constellation of CONSTELLATIONS) {
    for (const [a, b] of constellation.edges) {
      names.add(a)
      names.add(b)
    }
  }
  return names
})()

const DEG = Math.PI / 180
const RAD = 180 / Math.PI

export type StarSkyPosition = {
  name: string
  magnitude: number
  azimuth: number
  elevation: number
  aboveHorizon: boolean
  /** Dot radius in px — always smaller than planet dots (r=4). */
  radius: number
  opacity: number
  kind: 'star' | 'galaxy'
  /** Ellipse semi-axes for galaxies (px). */
  rx?: number
  ry?: number
  /** Ellipse rotation (degrees, SVG). */
  rotationDeg?: number
  /** Whether the star name should appear when Labels is on. */
  showLabel: boolean
}

/** Map magnitude onto size/opacity; brightest still under planet size. */
export function starVisual(magnitude: number): { radius: number; opacity: number } {
  const t = Math.max(0, Math.min(1, (magnitude - -1.5) / (3.7 - -1.5)))
  return {
    radius: 3 - t * 2.2, // ~3.0 … 0.8 (planets use r=4)
    opacity: 1 - t * 0.65, // 1.0 … 0.35
  }
}

export function starsSnapshotFromDate(
  when: Date,
  latitudeDeg: number,
  longitudeDeg: number,
): StarSkyPosition[] {
  const days = (when.getTime() - Date.UTC(2000, 0, 0, 12)) / 86_400_000
  const latitude = latitudeDeg * DEG
  const lst = localSiderealTimeDegrees(days, longitudeDeg)

  return BRIGHT_STARS.map((star) => {
    const declination = star.decDeg * DEG
    const hourAngle = normalizeDegrees(lst - star.raDeg)
    const elevation =
      Math.asin(
        Math.sin(latitude) * Math.sin(declination) +
          Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle * DEG),
      ) * RAD
    const azimuth = azimuthFromEquatorial(latitude, declination, hourAngle)
    const visual = starVisual(star.magnitude)
    const kind = star.kind ?? 'star'
    return {
      name: star.name,
      magnitude: star.magnitude,
      azimuth,
      elevation,
      aboveHorizon: elevation > 0,
      radius: visual.radius,
      opacity: kind === 'galaxy' ? Math.min(0.75, visual.opacity + 0.15) : visual.opacity,
      kind,
      showLabel: STAR_LABEL_NAMES.has(star.name),
      ...(kind === 'galaxy' ? { rx: 10, ry: 3.6, rotationDeg: 38 } : {}),
    }
  })
}

function azimuthFromEquatorial(
  latitudeRad: number,
  declinationRad: number,
  hourAngleDeg: number,
): number {
  const hourAngle = hourAngleDeg * DEG
  const y = Math.sin(hourAngle)
  const x =
    Math.cos(hourAngle) * Math.sin(latitudeRad) - Math.tan(declinationRad) * Math.cos(latitudeRad)
  let azimuth = Math.atan2(y, x) * RAD + 180
  azimuth %= 360
  if (azimuth < 0) azimuth += 360
  return azimuth
}

function localSiderealTimeDegrees(days: number, longitudeDeg: number): number {
  const greenwichHours = 18.697374558 + 24.06570982441908 * days
  return normalizeDegrees(greenwichHours * 15 + longitudeDeg)
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 540) % 360 - 180
}
