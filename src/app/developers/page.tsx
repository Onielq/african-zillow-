import type { Metadata } from "next";
import { DirectoryLandingPage } from "@/components/directories/DirectoryLandingPage";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "A source-aware Rwanda developer directory. Developer and project claims are published only when identity and permission are verified."
};

export default function DevelopersPage() {
  return (
    <DirectoryLandingPage
      kind="developers"
      eyebrow="DEVELOPER INTELLIGENCE / RWANDA"
      title="Know who stands behind a development."
      description="Developer discovery is useful only when company identity, project relationships and publication rights can be checked. This directory will not turn a name found online into an endorsed developer profile."
      status="Developer directory not connected"
      recordLabel="verified developer records published"
      emptyTitle="No verified developer directory is connected yet."
      emptyDescription="There is no authorised, maintained developer feed connected to this prototype. We are not inventing developer profiles, contact details, portfolios, delivery records or project relationships to fill the page."
      evidenceHeading="What a developer profile must prove"
      evidenceIntro="A developer profile is a claim about a real organisation and its role in a project. Each claim needs its own source and a clear date."
      evidence={[
        {
          number: "01",
          title: "Official identity",
          description: "Use the organisation's recognised legal or trading name and a reliable registration or official-company reference where available."
        },
        {
          number: "02",
          title: "Authority to represent",
          description: "Confirm that the organisation is the developer or an authorised representative for the projects shown. A public web page alone is not enough."
        },
        {
          number: "03",
          title: "Project links and track record",
          description: "Connect only projects whose identity, location and status have been independently checked; mark unverified claims as unavailable."
        },
        {
          number: "04",
          title: "Contact permission and freshness",
          description: "Publish contact information only with an appropriate source and permission, and retain the last-verified date for profile details."
        }
      ]}
    />
  );
}
