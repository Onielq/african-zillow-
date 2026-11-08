-- Taiseel unified spatial, development and exchange foundation.
-- Additive migration over the immutable REJA core and market-intelligence model.
-- No developer, project, parcel, property, listing or transaction sample rows are seeded.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS reja.user_identities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 auth_provider text NOT NULL CHECK (length(btrim(auth_provider)) BETWEEN 1 AND 80),
 auth_subject text NOT NULL CHECK (length(btrim(auth_subject)) BETWEEN 1 AND 255),
 email text, display_name text,
 identity_status text NOT NULL DEFAULT 'active' CHECK (identity_status IN ('active','disabled','pending')),
 email_verified_at timestamptz, last_seen_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (auth_provider, auth_subject)
);
CREATE UNIQUE INDEX IF NOT EXISTS user_identities_email_lower_uq ON reja.user_identities (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS reja.organizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_type text NOT NULL CHECK (organization_type IN ('developer','brokerage','agency','agent_business','government','service_provider','platform','other')),
 legal_name text NOT NULL CHECK (length(btrim(legal_name)) > 0),
 display_name text NOT NULL CHECK (length(btrim(display_name)) > 0),
 slug text NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 country_code char(2) NOT NULL DEFAULT 'RW',
 registration_number text,
 website_url text CHECK (website_url IS NULL OR website_url ~* '^https?://'),
 contact_email text, contact_phone text,
 verification_state text NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','pending','verified','rejected','suspended')),
 verification_source_id bigint REFERENCES reja.sources(id) ON DELETE SET NULL,
 verified_at timestamptz,
 verified_by_user_id uuid REFERENCES reja.user_identities(id) ON DELETE SET NULL,
 is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (verification_state <> 'verified' OR verified_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_lower_uq ON reja.organizations (lower(slug));
CREATE INDEX IF NOT EXISTS organizations_type_verification_idx ON reja.organizations (organization_type, verification_state) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS reja.organization_memberships (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES reja.organizations(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES reja.user_identities(id) ON DELETE CASCADE,
 membership_role text NOT NULL CHECK (membership_role IN ('owner','admin','listing_manager','agent','analyst','verifier','viewer')),
 membership_status text NOT NULL DEFAULT 'invited' CHECK (membership_status IN ('invited','active','suspended','revoked')),
 invited_by_user_id uuid REFERENCES reja.user_identities(id) ON DELETE SET NULL,
 joined_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_memberships_user_idx ON reja.organization_memberships (user_id, membership_status);
CREATE INDEX IF NOT EXISTS organization_memberships_org_idx ON reja.organization_memberships (organization_id, membership_status, membership_role);

CREATE TABLE IF NOT EXISTS reja.geographic_areas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 area_level text NOT NULL CHECK (area_level IN ('district','sector','cell','village')),
 parent_area_id uuid REFERENCES reja.geographic_areas(id) ON DELETE RESTRICT,
 source_id bigint REFERENCES reja.sources(id) ON DELETE RESTRICT,
 source_external_id text, area_code text,
 official_name text NOT NULL CHECK (length(btrim(official_name)) > 0),
 normalized_name text NOT NULL CHECK (length(btrim(normalized_name)) > 0),
 country_code char(2) NOT NULL DEFAULT 'RW',
 boundary geometry(MultiPolygon, 4326), boundary_observed_at timestamptz,
 boundary_confidence text NOT NULL DEFAULT 'unknown' CHECK (boundary_confidence IN ('official_source','derived','approximate','unknown')),
 valid_from date, valid_to date, is_current boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
 CHECK ((area_level = 'district' AND parent_area_id IS NULL) OR (area_level <> 'district' AND parent_area_id IS NOT NULL)),
 UNIQUE (source_id, source_external_id)
);
CREATE INDEX IF NOT EXISTS geographic_areas_parent_idx ON reja.geographic_areas (parent_area_id, area_level);
CREATE INDEX IF NOT EXISTS geographic_areas_name_idx ON reja.geographic_areas (lower(normalized_name), area_level);
CREATE INDEX IF NOT EXISTS geographic_areas_boundary_gix ON reja.geographic_areas USING gist (boundary);

CREATE TABLE IF NOT EXISTS reja.parcels (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_id bigint NOT NULL REFERENCES reja.sources(id) ON DELETE RESTRICT,
 source_external_id text NOT NULL CHECK (length(btrim(source_external_id)) > 0),
 upi text, parcel_number text,
 administrative_area_id uuid REFERENCES reja.geographic_areas(id) ON DELETE SET NULL,
 asset_id bigint REFERENCES reja.assets(id) ON DELETE SET NULL,
 area_sqm numeric(16,2) CHECK (area_sqm IS NULL OR area_sqm > 0),
 area_basis text NOT NULL DEFAULT 'unknown' CHECK (area_basis IN ('source_published','geometry_calculated','estimated','unknown')),
 parcel_geometry geometry(MultiPolygon, 4326),
 geometry_confidence text NOT NULL DEFAULT 'unknown' CHECK (geometry_confidence IN ('official_source','derived','approximate','unknown')),
 source_observed_at timestamptz,
 legal_status text NOT NULL DEFAULT 'unverified' CHECK (legal_status IN ('unverified','verified_by_authority','disputed','unknown')),
 availability_status text NOT NULL DEFAULT 'unknown' CHECK (availability_status IN ('unknown','advertised','not_available','under_offer')),
 record_state text NOT NULL DEFAULT 'current' CHECK (record_state IN ('current','superseded','withdrawn','under_review')),
 source_record_sha256 char(64) CHECK (source_record_sha256 IS NULL OR source_record_sha256 ~ '^[0-9a-f]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (source_id, source_external_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS parcels_upi_uq ON reja.parcels (upi) WHERE upi IS NOT NULL AND record_state = 'current';
CREATE INDEX IF NOT EXISTS parcels_area_idx ON reja.parcels (administrative_area_id, record_state);
CREATE INDEX IF NOT EXISTS parcels_geometry_gix ON reja.parcels USING gist (parcel_geometry);
CREATE INDEX IF NOT EXISTS parcels_source_date_idx ON reja.parcels (source_id, source_observed_at DESC);

CREATE TABLE IF NOT EXISTS reja.parcel_observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 parcel_id uuid NOT NULL REFERENCES reja.parcels(id) ON DELETE CASCADE,
 ingestion_run_id bigint REFERENCES reja.ingestion_runs(id) ON DELETE SET NULL,
 source_id bigint NOT NULL REFERENCES reja.sources(id) ON DELETE RESTRICT,
 observed_at timestamptz NOT NULL DEFAULT now(),
 record_sha256 char(64) NOT NULL CHECK (record_sha256 ~ '^[0-9a-f]{64}$'),
 source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_snapshot) = 'object'),
 UNIQUE (parcel_id, record_sha256)
);
CREATE INDEX IF NOT EXISTS parcel_observations_parcel_date_idx ON reja.parcel_observations (parcel_id, observed_at DESC);

CREATE TABLE IF NOT EXISTS reja.development_projects (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 developer_organization_id uuid REFERENCES reja.organizations(id) ON DELETE SET NULL,
 legacy_developer_external_id text REFERENCES reja.developers(external_id) ON DELETE SET NULL,
 project_code text, name text NOT NULL CHECK (length(btrim(name)) > 0),
 project_type text NOT NULL DEFAULT 'unknown' CHECK (project_type IN ('residential','commercial','industrial','mixed_use','land_development','infrastructure','other','unknown')),
 lifecycle_state text NOT NULL DEFAULT 'unknown' CHECK (lifecycle_state IN ('planning','pre_sales','under_construction','completed','on_hold','cancelled','unknown')),
 verification_state text NOT NULL DEFAULT 'unverified' CHECK (verification_state IN ('unverified','pending','verified','rejected','disputed')),
 description text, district_area_id uuid REFERENCES reja.geographic_areas(id) ON DELETE SET NULL,
 location geometry(Point, 4326), site_boundary geometry(MultiPolygon, 4326),
 planned_units integer CHECK (planned_units IS NULL OR planned_units >= 0),
 expected_start_date date, expected_completion_date date, actual_completion_date date,
 primary_source_id bigint REFERENCES reja.sources(id) ON DELETE SET NULL,
 created_by_user_id uuid REFERENCES reja.user_identities(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (expected_completion_date IS NULL OR expected_start_date IS NULL OR expected_completion_date >= expected_start_date)
);
CREATE INDEX IF NOT EXISTS development_projects_org_idx ON reja.development_projects (developer_organization_id, lifecycle_state);
CREATE INDEX IF NOT EXISTS development_projects_location_gix ON reja.development_projects USING gist (location);
CREATE INDEX IF NOT EXISTS development_projects_boundary_gix ON reja.development_projects USING gist (site_boundary);

CREATE TABLE IF NOT EXISTS reja.development_project_parcels (
 project_id uuid NOT NULL REFERENCES reja.development_projects(id) ON DELETE CASCADE,
 parcel_id uuid NOT NULL REFERENCES reja.parcels(id) ON DELETE RESTRICT,
 relationship_type text NOT NULL DEFAULT 'site' CHECK (relationship_type IN ('site','phase','adjacent','access','other')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (project_id, parcel_id, relationship_type)
);

CREATE TABLE IF NOT EXISTS reja.development_buildings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES reja.development_projects(id) ON DELETE CASCADE,
 building_code text, name text NOT NULL,
 building_type text NOT NULL DEFAULT 'unknown' CHECK (building_type IN ('apartment','house','office','retail','warehouse','other','unknown')),
 lifecycle_state text NOT NULL DEFAULT 'unknown' CHECK (lifecycle_state IN ('planning','under_construction','completed','on_hold','cancelled','unknown')),
 floors_above_ground smallint CHECK (floors_above_ground IS NULL OR floors_above_ground BETWEEN 0 AND 300),
 floors_below_ground smallint CHECK (floors_below_ground IS NULL OR floors_below_ground BETWEEN 0 AND 50),
 gross_floor_area_sqm numeric(16,2) CHECK (gross_floor_area_sqm IS NULL OR gross_floor_area_sqm > 0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id, building_code)
);
CREATE INDEX IF NOT EXISTS development_buildings_project_idx ON reja.development_buildings (project_id);

CREATE TABLE IF NOT EXISTS reja.development_units (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 project_id uuid NOT NULL REFERENCES reja.development_projects(id) ON DELETE CASCADE,
 building_id uuid REFERENCES reja.development_buildings(id) ON DELETE SET NULL,
 unit_code text NOT NULL CHECK (length(btrim(unit_code)) > 0),
 unit_type text NOT NULL DEFAULT 'unknown' CHECK (unit_type IN ('apartment','house','office','retail','land','other','unknown')),
 unit_state text NOT NULL DEFAULT 'unknown' CHECK (unit_state IN ('planned','available','reserved','sold','leased','handed_over','withdrawn','unknown')),
 bedrooms smallint CHECK (bedrooms IS NULL OR bedrooms BETWEEN 0 AND 30),
 bathrooms numeric(4,1) CHECK (bathrooms IS NULL OR bathrooms BETWEEN 0 AND 50),
 internal_area_sqm numeric(14,2) CHECK (internal_area_sqm IS NULL OR internal_area_sqm > 0),
 plot_area_sqm numeric(14,2) CHECK (plot_area_sqm IS NULL OR plot_area_sqm > 0),
 floor_label text, source_id bigint REFERENCES reja.sources(id) ON DELETE SET NULL,
 source_observed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (project_id, unit_code)
);
CREATE INDEX IF NOT EXISTS development_units_project_state_idx ON reja.development_units (project_id, unit_state);

ALTER TABLE reja.market_properties ADD COLUMN IF NOT EXISTS parcel_id uuid REFERENCES reja.parcels(id) ON DELETE SET NULL;
ALTER TABLE reja.market_properties ADD COLUMN IF NOT EXISTS development_project_id uuid REFERENCES reja.development_projects(id) ON DELETE SET NULL;
ALTER TABLE reja.market_properties ADD COLUMN IF NOT EXISTS development_unit_id uuid REFERENCES reja.development_units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS market_properties_parcel_idx ON reja.market_properties (parcel_id) WHERE parcel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_properties_project_idx ON reja.market_properties (development_project_id) WHERE development_project_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS reja.market_listing_authorizations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 listing_id bigint NOT NULL REFERENCES reja.market_listings(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES reja.organizations(id) ON DELETE RESTRICT,
 submitted_by_user_id uuid REFERENCES reja.user_identities(id) ON DELETE SET NULL,
 authority_type text NOT NULL CHECK (authority_type IN ('owner','developer','exclusive_agent','authorized_agent','brokerage_mandate','other')),
 evidence_source_id bigint REFERENCES reja.sources(id) ON DELETE SET NULL,
 evidence_url text CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
 evidence_reference text,
 evidence_sha256 char(64) CHECK (evidence_sha256 IS NULL OR evidence_sha256 ~ '^[0-9a-f]{64}$'),
 authorization_state text NOT NULL DEFAULT 'pending' CHECK (authorization_state IN ('pending','verified','rejected','expired','revoked')),
 valid_from timestamptz, valid_until timestamptz,
 reviewed_by_user_id uuid REFERENCES reja.user_identities(id) ON DELETE SET NULL,
 reviewed_at timestamptz, review_note text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
 CHECK (authorization_state <> 'verified' OR (reviewed_at IS NOT NULL AND reviewed_by_user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS listing_authorizations_listing_idx ON reja.market_listing_authorizations (listing_id, authorization_state, valid_until DESC);

ALTER TABLE reja.market_listings ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES reja.organizations(id) ON DELETE SET NULL;
ALTER TABLE reja.market_listings ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES reja.user_identities(id) ON DELETE SET NULL;
ALTER TABLE reja.market_listings ADD COLUMN IF NOT EXISTS publication_state text NOT NULL DEFAULT 'research_only'
 CHECK (publication_state IN ('research_only','draft','review_pending','published','paused','withdrawn','rejected'));
ALTER TABLE reja.market_listings ADD COLUMN IF NOT EXISTS published_at timestamptz;
ALTER TABLE reja.market_listings ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE reja.market_listings ADD COLUMN IF NOT EXISTS moderation_note text;
CREATE INDEX IF NOT EXISTS market_listings_publication_idx ON reja.market_listings (publication_state, last_seen_at DESC)
 WHERE is_current = true AND publication_state = 'published';
CREATE INDEX IF NOT EXISTS market_listings_org_idx ON reja.market_listings (organization_id, publication_state, last_seen_at DESC);

CREATE OR REPLACE FUNCTION reja.enforce_listing_publication_authority()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.publication_state = 'published' THEN
  IF NEW.organization_id IS NULL OR NEW.published_at IS NULL THEN
   RAISE EXCEPTION 'A published listing must have an organization and published_at timestamp';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reja.organizations o
   WHERE o.id = NEW.organization_id AND o.is_active = true AND o.verification_state = 'verified') THEN
   RAISE EXCEPTION 'A listing cannot be published by an unverified or inactive organization';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM reja.market_listing_authorizations a
   WHERE a.listing_id = NEW.id AND a.organization_id = NEW.organization_id
    AND a.authorization_state = 'verified'
    AND (a.valid_from IS NULL OR a.valid_from <= now())
    AND (a.valid_until IS NULL OR a.valid_until > now())) THEN
   RAISE EXCEPTION 'A listing cannot be published without verified, current authority';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS market_listing_authority_gate ON reja.market_listings;
CREATE TRIGGER market_listing_authority_gate
 BEFORE INSERT OR UPDATE OF publication_state, organization_id, published_at
 ON reja.market_listings FOR EACH ROW
 EXECUTE FUNCTION reja.enforce_listing_publication_authority();

CREATE OR REPLACE VIEW reja.geo_areas AS
SELECT id, area_level, parent_area_id, source_id, source_external_id, area_code,
 official_name, normalized_name, country_code, boundary, boundary_observed_at,
 boundary_confidence, valid_from, valid_to, is_current
FROM reja.geographic_areas;

CREATE OR REPLACE VIEW reja.exchange_listings AS
SELECT id, source_id, source_record_key, property_id, asset_id, organization_id,
 created_by_user_id, listing_type, asking_amount, currency, rent_period, property_type,
 district_label, sector_label, property_area_sqm, listing_url, listing_status,
 publication_state, published_at, expires_at, moderation_note, first_seen_at,
 last_seen_at, is_current, asking_price_per_sqm
FROM reja.market_listings;

CREATE OR REPLACE VIEW reja.public_market_listings AS
SELECT l.id, l.listing_type, l.asking_amount, l.currency, l.rent_period,
 l.property_type, l.district_label, l.sector_label, l.property_area_sqm,
 l.asking_price_per_sqm, l.listing_url, l.first_seen_at, l.last_seen_at, l.expires_at,
 o.display_name AS organization_name,
 p.project_name, p.building_name, p.unit_label, p.bedrooms, p.bathrooms,
 p.internal_area_sqm, p.plot_area_sqm
FROM reja.market_listings l
JOIN reja.organizations o ON o.id = l.organization_id
LEFT JOIN reja.market_properties p ON p.id = l.property_id
WHERE l.is_current = true AND l.listing_status = 'active'
 AND l.publication_state = 'published'
 AND o.is_active = true AND o.verification_state = 'verified'
 AND (l.expires_at IS NULL OR l.expires_at > now())
 AND EXISTS (SELECT 1 FROM reja.market_listing_authorizations a
  WHERE a.listing_id = l.id AND a.organization_id = l.organization_id
   AND a.authorization_state = 'verified'
   AND (a.valid_from IS NULL OR a.valid_from <= now())
   AND (a.valid_until IS NULL OR a.valid_until > now()));

CREATE OR REPLACE VIEW reja.verified_developer_directory AS
SELECT o.id AS organization_id, o.display_name, o.website_url,
 o.contact_email, o.contact_phone, o.verification_state, o.verified_at
FROM reja.organizations o
WHERE o.organization_type = 'developer' AND o.is_active = true
 AND o.verification_state = 'verified';

CREATE OR REPLACE VIEW reja.platform_data_counts AS
SELECT
 (SELECT count(*) FROM reja.geographic_areas WHERE is_current = true) AS administrative_area_count,
 (SELECT count(*) FROM reja.parcels WHERE record_state = 'current') AS parcel_record_count,
 (SELECT count(*) FROM reja.development_projects) AS project_record_count,
 (SELECT count(*) FROM reja.development_units) AS unit_record_count,
 (SELECT count(*) FROM reja.organizations WHERE is_active = true) AS organization_count,
 (SELECT count(*) FROM reja.market_listings WHERE is_current = true AND publication_state = 'published') AS public_listing_count,
 (SELECT count(*) FROM reja.market_verified_transactions) AS verified_transaction_count;

COMMENT ON TABLE reja.geographic_areas IS 'Administrative boundaries only: district > sector > cell > village. Not proof of parcel ownership.';
COMMENT ON TABLE reja.parcels IS 'Cadastral geometry and sourced parcel attributes. A polygon does not establish ownership, title, availability or value.';
COMMENT ON TABLE reja.development_projects IS 'Developer project records with explicit verification state and source provenance.';
COMMENT ON TABLE reja.market_listing_authorizations IS 'Evidence that an organization has authority to advertise a specific listing.';
COMMENT ON VIEW reja.public_market_listings IS 'Only active, unexpired listings with verified organization and verified current listing authority.';
