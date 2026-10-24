import type { Metadata } from "next";
import { DirectoryLandingPage } from "@/components/directories/DirectoryLandingPage";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "Explore the Rwanda Land Intelligence project directory. Only verified, permitted project records will be published."
};

export default function ProjectsPage() {
  return (
    <DirectoryLandingPage
      kind="projects"
      eyebrow="PROJECT INTELLIGENCE / RWANDA"
      title="Project discovery, without guesswork."
      description="A reliable development directory needs more than an announcement or a location pin. Every entry must have a traceable source, a verified project identity, a current status and permission to publish the details."
      status="Project feed not connected"
      recordLabel="verified project records published"
      emptyTitle="No verified project feed is connected yet."
      emptyDescription="We are not publishing unverified launch dates, asking prices, payment plans, construction percentages or unit availability. Those details will appear only after a permitted source or authorised developer feed is connected and checked."
      evidenceHeading="What a project record must prove"
      evidenceIntro="The reference interface expects project cards and upcoming-supply counts. Rwanda data must support those facts first; this checklist defines the gate before a record appears."
      evidence={[
        {
          number: "01",
          title: "Source and display permission",
          description: "A named publisher or authorised partner, a source URL, required attribution and documented permission for the fields displayed."
        },
        {
          number: "02",
          title: "Identity and location",
          description: "A stable project ID, its recognised name, the responsible developer and a supported geographic identifier or validated coordinates."
        },
        {
          number: "03",
          title: "Current project status",
          description: "Evidence for proposed, under-construction, launched or completed status, plus the date that status was last checked."
        },
        {
          number: "04",
          title: "Prices and delivery claims",
          description: "Currency, effective date and source for prices or payment terms; source-backed unit counts and completion dates wherever available."
        }
      ]}
    />
  );
}
