import type { Metadata } from "next";
import { DirectoryLandingPage } from "@/components/directories/DirectoryLandingPage";
import { RWANDA_DEVELOPER_CANDIDATES } from "@/data/developer-directory";

export const metadata: Metadata = {
  title: "Developers & Agents",
  description:
    "A source-aware Rwanda property directory that separates developers, estate agencies and independent agents, with verification for each role."
};

export default function DevelopersPage() {
  return (
    <DirectoryLandingPage
      kind="developers"
      eyebrow="DEVELOPER & AGENT INTELLIGENCE / RWANDA"
      title="Know who builds, who sells, and who represents."
      description="Rwanda's property market includes developers, agencies and individual agents. This directory can include all three without confusing their roles. Profiles, project relationships and public contact details appear only when identity, authority and publication permission are checked."
      status="20 candidate organizations supplied · 0 verified"
      recordLabel="verified profiles published"
      emptyTitle="Supplied candidates are ready for review."
      emptyDescription="The first 20 organizations have been added from your table. Their names, supplied focus areas and six numeric fields are preserved below. No record is presented as verified, and the six numeric fields are not interpreted because the original column headings were missing."
      profileTypes={[
        {
          title: "Property developers",
          description: "Companies or organisations responsible for developing land or delivering a project. Their verified projects and delivery track record can be linked to the profile.",
          publicationRule: "Developer status requires evidence of the organisation's actual role in a project."
        },
        {
          title: "Estate agencies",
          description: "Businesses that market, broker or manage property transactions. Their agency profile can include permitted office contacts, service areas and verified listings.",
          publicationRule: "Agency status is separate from ownership or development responsibility."
        },
        {
          title: "Independent agents",
          description: "Individual property intermediaries connected to an agency or working independently. Their professional role and any project representation are shown separately.",
          publicationRule: "An agent is never presented as a developer without independent evidence."
        }
      ]}
      templateHref="/developer-directory-template.csv"
      templateLabel="Download directory CSV template"
      candidateRecords={RWANDA_DEVELOPER_CANDIDATES}
      evidenceHeading="What each profile must prove"
      evidenceIntro="A name is only a lead. Every published claim needs a source, a responsible party and a clear verification status."
      evidence={[
        {
          number: "01",
          title: "Official identity",
          description: "Use the recognised legal or trading name and a reliable registration or official-company reference where available."
        },
        {
          number: "02",
          title: "Verified market role",
          description: "Confirm whether the record is a developer, estate agency or independent agent. Do not infer developer status from advertising or selling a project."
        },
        {
          number: "03",
          title: "Project links and track record",
          description: "Connect only projects whose identity, location and status have been checked. Keep unverified claims labelled as unverified."
        },
        {
          number: "04",
          title: "Contact permission and freshness",
          description: "Publish contact details only when they are suitable for public display and permission is recorded. Keep a last-verified date for profile details."
        }
      ]}
    />
  );
}
