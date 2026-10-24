export type AgencyCandidate = {
  id: string;
  name: string;
  segment: string;
  website: string;
  sourceLabel: string;
  status: "Source found · review pending";
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
  }
];

export type PublicAgentCandidate = {
  id: string;
  name: string;
  segment: string;
  sourceUrl: string;
  sourceLabel: string;
  status: "Needs affiliation check";
};

export const RWANDA_PUBLIC_AGENT_CANDIDATES: PublicAgentCandidate[] = [
  {
    id: "micomyiza-vincent-de-paul",
    name: "Micomyiza Vincent de Paul",
    segment: "Agent listed by Homeland Real Estate Agency",
    sourceUrl: "https://homeland.rw/agency/homeland-real-estate-agency/",
    sourceLabel: "Published on the agency's public profile",
    status: "Needs affiliation check"
  }
];
