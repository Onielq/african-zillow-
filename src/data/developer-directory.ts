export type DeveloperCandidate = {
  id: string;
  name: string;
  segment: string;
  /**
   * Six values exactly as supplied by the user.
   * The original column headings were not included, so the app must not infer their meaning.
   */
  sourceMetrics: [string, string, string, string, string, string];
  status: "Needs verification";
  /** Public website found during initial research; does not mean the profile is verified. */
  website?: string;
  /** Public logo asset URL found on an official site or public company profile. */
  logoUrl?: string;
};

export const RWANDA_DEVELOPER_CANDIDATES: DeveloperCandidate[] = [
  { id: "homart-properties", name: "Homart Properties", segment: "Premium residential / mixed-use", website: "https://homartproperties.com/", sourceMetrics: ["10", "403+", "4", "0", "72", "67"], status: "Needs verification" },
  { id: "ultimate-developers-ltd", name: "Ultimate Developers Ltd (UDL)", segment: "Residential / Commercial / Hospitality", website: "https://udl.rw/", sourceMetrics: ["7", "2,004+", "5", "0", "81", "62"], status: "Needs verification" },
  { id: "imara-properties", name: "Imara Properties", segment: "Luxury residential", website: "https://www.imara-properties.com/", logoUrl: "https://pbs.twimg.com/profile_images/1377955186182926340/NIk0Qwa0.jpg", sourceMetrics: ["7", "86+", "4", "0", "77", "78"], status: "Needs verification" },
  { id: "delta-fortico-group", name: "Delta Developers / Fortico Group", segment: "Luxury residential / development", website: "https://delta-rwanda.com/", logoUrl: "https://delta-rwanda.com/assets/delta-developers-B6ukr5Mu.png", sourceMetrics: ["5", "170", "3", "0", "78", "91"], status: "Needs verification" },
  { id: "remote-group-estate", name: "Remote Group / Remote Estate", segment: "Engineering / Construction / Real estate", website: "https://www.remotegroup.com/", sourceMetrics: ["2", "2,978", "0", "1", "30", "70"], status: "Needs verification" },
  { id: "reportage-rwanda", name: "Reportage Rwanda / Reportage Properties", segment: "Luxury residential", website: "https://reportagegroup.com/rw/", sourceMetrics: ["2", "125+", "0", "0", "—", "68"], status: "Needs verification" },
  { id: "belle-ville-groupe", name: "Belle Ville Groupe", segment: "Luxury / serviced apartments", website: "https://bellevillegroupe.com/", sourceMetrics: ["2", "30+", "1", "0", "75", "71"], status: "Needs verification" },
  { id: "adhi-rwanda", name: "ADHI Rwanda Ltd", segment: "Affordable residential development", website: "https://rwanda.adhicorp.com/", sourceMetrics: ["1", "247", "1", "0", "90", "93"], status: "Needs verification" },
  { id: "fortis-green-housing", name: "Fortis Green Housing", segment: "Green residential development", website: "https://www.fortisgreenhousing.com/", sourceMetrics: ["1", "386", "0", "0", "—", "98"], status: "Needs verification" },
  { id: "savannah-creek", name: "Savannah Creek Development Company", segment: "Luxury master-planned residential", website: "https://savannahcreek.rw/", sourceMetrics: ["1", "840", "0", "0", "—", "84"], status: "Needs verification" },
  { id: "ramba-real-estate", name: "Ramba Real Estate Ltd", segment: "Mixed-use real estate", sourceMetrics: ["1", "—", "0", "0", "—", "83"], status: "Needs verification" },
  { id: "evergreen-investment", name: "Evergreen Investment", segment: "Premium residential", sourceMetrics: ["1", "—", "1", "0", "90", "74"], status: "Needs verification" },
  { id: "rwanda-housing-authority", name: "Rwanda Housing Authority (RHA)", segment: "Public housing / rehousing", sourceMetrics: ["1", "1,600", "0", "0", "—", "83"], status: "Needs verification" },
  { id: "rwanda-social-security-board", name: "Rwanda Social Security Board (RSSB)", segment: "Institutional investor / housing", sourceMetrics: ["1", "548", "0", "0", "—", "85"], status: "Needs verification" },
  { id: "see-far-housing", name: "See Far Housing Ltd", segment: "Affordable / mid-market residential", sourceMetrics: ["1", "—", "0", "0", "—", "29"], status: "Needs verification" },
  { id: "urukumbuzi", name: "Urukumbuzi Ltd", segment: "Residential development", sourceMetrics: ["1", "—", "0", "0", "—", "29"], status: "Needs verification" },
  { id: "abadahigwa-kuntego", name: "Abadahigwa Kuntego Ltd", segment: "Residential development", sourceMetrics: ["1", "—", "0", "0", "—", "29"], status: "Needs verification" },
  { id: "nextgen-developers", name: "NextGen Developers", segment: "Residential development", sourceMetrics: ["1", "—", "0", "0", "—", "29"], status: "Needs verification" },
  { id: "groupe-palmeraie-developpement", name: "Groupe Palmeraie Développement", segment: "Residential development", sourceMetrics: ["1", "1,300", "0", "0", "—", "80"], status: "Needs verification" },
  { id: "gc-investment", name: "GC Investment Ltd", segment: "Residential development", sourceMetrics: ["1", "—", "0", "0", "—", "29"], status: "Needs verification" }
];
