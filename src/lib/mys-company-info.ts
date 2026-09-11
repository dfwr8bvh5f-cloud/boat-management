// MYS's own legal/company details and bank account, for the generated
// invoice document (src/app/(app)/mys/invoices/[id]/page.tsx). Fixed
// values she gave directly (company registration papers/bank letter) -
// there's no settings UI for these since she hasn't asked to edit them from
// the app; change here directly if they ever do change.
export const MYS_COMPANY_INFO = {
  name: "MED YACHT SOLUTION I.K.E",
  tagline: "Repair and maintenance of ships and boats",
  addressLines: ["Akti Kountouriotou 11, Piraeus Attica, PC 185 34", "Greece"],
  phone: "+30 6944929393",
  email: "info@medyachtings.com",
  vat: "EL 802765450",
  taxOffice: "DOY A' Peiraia",
};

export const MYS_BANK_DETAILS = {
  bankName: "Piraeus Bank S.A",
  ibanEur: "GR9401721030005103114916805",
  ibanUsd: "GR9401721030005103114916902",
  swift: "PIRBGRAA",
  address: "Amerikis Street 4",
  country: "Greece",
};
