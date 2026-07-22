// Whitelist of authorized dosen emails from Data Nomor_Email Dosen Kesmas.xlsx
export const DOSEN_WHITELIST: { email: string; nama: string }[] = [
  { email: 'chandrayanis@upnvj.ac.id', nama: 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.' },
  { email: 'putripermatasari@upnvj.ac.id', nama: 'Dr. Putri Permatasari, S.K.M., M.K.M.' },
  { email: 'dyahutari@upnvj.ac.id', nama: 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K.' },
  { email: 'fajarianurcandra@upnvj.ac.id', nama: 'Dr. Fajaria Nurcandra, S.K.M., M.Epid.' },
  { email: 'agusjoko@upnvj.ac.id', nama: 'Dr. Agus Joko Susanto., S.K.M., M.K.K.K.' },
  { email: 'afif.amir@upnvj.ac.id', nama: 'Afif Amir Amrullah, S.Kp., M.K.K.K.' },
  { email: 'marinaerysetiawati@upnvj.ac.id', nama: 'Dra. Marina Ery Setiyawati, M.M.' },
  { email: 'cahyaarbitera@upnvj.ac.id', nama: 'Cahya Arbitera, S.K.M., M.K.M.' },
  { email: 'naylakamiliafithri@upnvj.ac.id', nama: 'Nayla Kamilia Fithri, S.K.M., M.P.H.' },
  { email: 'chahyakharin@upnvj.ac.id', nama: 'Chahya Kharin Herbawani, S.Keb., Bd., M.K.M.' },
  { email: 'arga.buntara@upnvj.ac.id', nama: 'Arga Buntara, S.K.M., M.P.H.' },
  { email: 'ulyaqoulankarima@upnvj.ac.id', nama: 'Ulya Qoulan Karima, S.K.M., M.Epid.' },
  { email: 'adeliasuryani@upnvj.ac.id', nama: 'Adelia Suryani, S.K.M., M.K.M.' },
  { email: 'agungraharjo@upnvj.ac.id', nama: 'Agung Raharjo, S.K.M., M.K.K.K.' },
  { email: 'januarariyanto@upnvj.ac.id', nama: 'Dr. Januar Ariyanto, S.K.M., M.Kes.' },
  { email: 'yunitaraeni@upnvj.ac.id', nama: 'Dr. Yunita Amraeni, S.K.M., M.K.M.' },
  { email: 'farahuljannah@upnvj.ac.id', nama: 'Farahul Jannah, S.Kep., M.K.K.K.' },
  { email: 'ismifarah@upnvj.ac.id', nama: 'Ismi Farah Syarifah, M.Sc.' },
  { email: 'fadliramadhansyah@upnvj.ac.id', nama: 'Muhammad Fadli Ramadhansyah, S.K.M., M.Kes.' },
  { email: 'promisetyaningrum@upnvj.ac.id', nama: 'Promisetyaningrum Fitria Nurani, S.K.M., M.P.H.' },
  { email: 'laily.hanifah@upnvj.ac.id', nama: 'Dr. Laily Hanifah, S.K.M, M.Kes.' },
  { email: 'apriningsih@upnvj.ac.id', nama: 'Dr. Apriningsih, M.K.M.' },
  { email: 'eenkurnaesih@upnvj.ac.id', nama: 'Dr. Hj. Een Kurnaesih, S.K.M., M.Kes.' },
  { email: 'riswandywasir@upnvj.ac.id', nama: 'Apt. Riswandy Wasir, S.Farm., M.P.H., PhD.' },
  { email: 'nsuparni@upnvj.ac.id', nama: 'Dr. Suparni, S.T., M.K.K.' },
  { email: 'lusytapuri@upnvj.ac.id', nama: 'Dr. Lusyta Puri Ardhiyanti, S.ST., M.Kes.' },
  { email: 'ayu.adp@upnvj.ac.id', nama: 'Ayu Anggraeni Dyah Purbasari, S.K.M.,MPH(M)' },
  { email: 'ikamaulidanurrahma@gmail.com', nama: 'Ika Maulida Nurrahma, S.K.M., M.Kes.' },
  { email: 'fathinahranggaunihardy@gmail.com', nama: 'Dr. Fathinah Ranggauni Hardy, SKM, M.Epid' },
  { email: 'h.iswanto@upnvj.ac.id', nama: 'Prof. Dr. Acim Heri Iswanto, S.K.M, MARS' },
  // S2 Kesmas Dosen
  { email: 'firliaayuarini@upnvj.ac.id', nama: 'Dr. Firlia Ayu Arini, S.K.M.,M.K.M' },
  { email: 'intania@upnvj.ac.id', nama: 'Dr. Nur Intania Sofianita, S.I.Kom, MKM' },
  { email: 'yessi@upnvj.ac.id', nama: 'Dr. dr. Yessi Crosita Octaria, M.I.H., MIH' },
  { email: 'netti.herawati@upnvj.ac.id', nama: 'Prof. Dr. Ir. Netti Herawati, M.Si.' },
]

export const SUPERADMIN_EMAILS = ['agungraharjo@upnvj.ac.id']

export function isSuperadmin(email: string): boolean {
  return SUPERADMIN_EMAILS.some(e => e.toLowerCase() === email.toLowerCase())
}

export function isDosenEmail(email: string): { isDosen: boolean; nama: string } {
  const found = DOSEN_WHITELIST.find(
    (d) => d.email.toLowerCase() === email.toLowerCase()
  )
  return { isDosen: !!found, nama: found?.nama || '' }
}
