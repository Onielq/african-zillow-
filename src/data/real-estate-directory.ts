export type AgencyCandidate = {
  id: string;
  name: string;
  segment: string;
  website: string;
  sourceLabel: string;
  status: "Source found · review pending";
  logoUrl?: string;
};

export const RWANDA_REAL_ESTATE_AGENCIES: AgencyCandidate[] = [
  {
    id: "homeland-real-estate",
    name: "Homeland Real Estate Agency",
    segment: "Property sales, rentals, valuation and management",
    website: "https://homeland.rw/",
    sourceLabel: "Official agency website",
    status: "Source found · review pending"
  },
  {
    id: "vibe-real-estate",
    name: "Vibe Real Estate",
    segment: "Property brokerage, investment and listings",
    website: "https://vibe.rw/agency/",
    sourceLabel: "Official agency website",
    status: "Source found · review pending"
  },
  {
    id: "kwanda-real-estate",
    name: "Kwanda Real Estate",
    segment: "Real estate agency and consultancy",
    website: "https://kwandarealestate.com/",
    sourceLabel: "Company website listed on public company profile",
    status: "Source found · review pending"
  },
  {
    id: "house-crest-rwanda",
    name: "House Crest Rwanda",
    segment: "Property consultation, management, buying and selling",
    website: "https://housecrestrwanda.com/",
    sourceLabel: "Official agency website",
    status: "Source found · review pending"
  },
  {
    id: "tuza-real-estate",
    name: "TUZA Real Estate",
    segment: "Property and land sales, leasing and owner support",
    website: "https://tuza.app/",
    sourceLabel: "Official company website",
    status: "Source found · review pending"
  },
  {
    id: "orivanta-property",
    name: "Orivanta Property Ltd",
    segment: "Brokerage, property valuation, management and advisory",
    website: "https://www.orivantaproperty.rw/en",
    sourceLabel: "Official company website",
    status: "Source found · review pending"
  },
  {
    id: "abahuza",
    name: "Abahuza.com",
    segment: "Real estate agent platform",
    website: "http://www.abahuza.com/",
    sourceLabel: "Public company profile lists this website",
    status: "Source found · review pending"
  },
  {
    id: "elimo",
    name: "Elimo",
    segment: "Property sales, rentals and development discovery",
    website: "https://elimo.rw/",
    sourceLabel: "Official company website",
    status: "Source found · review pending"
  },
  {
    id: "plut-properties",
    name: "Plut Properties Ltd",
    segment: "Real estate sales and rentals",
    website: "https://plutproperties.com/",
    sourceLabel: "Official agency website",
    status: "Source found · review pending"
  },
  {
    id: "kin-realty",
    name: "Kin Realty",
    segment: "Real estate agency and brokerage",
    website: "https://www.kinrealty.rw/",
    sourceLabel: "Official agency website",
    status: "Source found · review pending"
  },
  {
    id: "rish-global-properties",
    name: "RISH Global Properties",
    segment: "Real estate, valuation and advisory",
    website: "https://rishproperties.com/",
    sourceLabel: "Official company website",
    status: "Source found · review pending"
  } 
];

export type PublicAgentCandidate = {
  id: string;
  name: string;
  segment: string;
  agency: string;
  sourceUrl: string;
  sourceLabel: string;
  status: "Needs affiliation check";
};

export const RWANDA_PUBLIC_AGENT_CANDIDATES: PublicAgentCandidate[] = [
  {
    id: "micomyiza-vincent-de-paul",
    name: "Micomyiza Vincent de Paul",
    segment: "Agent listed on a public agency profile",
    agency: "Homeland Real Estate Agency",
    sourceUrl: "https://homeland.rw/agency/homeland-real-estate-agency/",
    sourceLabel: "Public agency profile",
    status: "Needs affiliation check"
  },
  {
    id: "arstide-yves-horimbere",
    name: "Arstide Yves Horimbere",
    segment: "Real Estate Specialist",
    agency: "Elimo",
    sourceUrl: "https://elimo.rw/",
    sourceLabel: "Elimo team page",
    status: "Needs affiliation check"
  },
  {
    id: "grace-uwacu",
    name: "Grace Uwacu",
    segment: "Realtor",
    agency: "Elimo",
    sourceUrl: "https://elimo.rw/",
    sourceLabel: "Elimo team page",
    status: "Needs affiliation check"
  },
  {
    id: "yassin-musabyimana",
    name: "Yassin Musabyimana",
    segment: "Agent",
    agency: "Plut Properties Ltd",
    sourceUrl: "https://plutproperties.com/agents-2/",
    sourceLabel: "Public agents page",
    status: "Needs affiliation check"
  },
  {
    id: "ibrahim-manirabizi",
    name: "Ibrahim Manirabizi",
    segment: "Agent",
    agency: "Plut Properties Ltd",
    sourceUrl: "https://plutproperties.com/agents-2/",
    sourceLabel: "Public agents page",
    status: "Needs affiliation check"
  },
  {
    id: "gustave-niyonkuru",
    name: "Gustave Niyonkuru",
    segment: "Founder / agent",
    agency: "Kin Realty",
    sourceUrl: "https://www.kinrealty.rw/agents/",
    sourceLabel: "Public agents page",
    status: "Needs affiliation check"
  },
  {
    id: "rugamba-s-bertin",
    name: "Rugamba S Bertin",
    segment: "Co-founder / agent",
    agency: "Kin Realty",
    sourceUrl: "https://www.kinrealty.rw/agents/",
    sourceLabel: "Public agents page",
    status: "Needs affiliation check"
  },
  {
    id: "izere-irakiza-aime-johnson",
    name: "IZERE IRAKIZA Aime Johnson",
    segment: "Lead Agent",
    agency: "RISH Global Properties",
    sourceUrl: "https://rishproperties.com/",
    sourceLabel: "Public team page",
    status: "Needs affiliation check"
  }
];
