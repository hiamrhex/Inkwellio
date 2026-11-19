CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_lowercase_check" CHECK ("users"."email" = lower("users"."email")),
	CONSTRAINT "users_email_shape_check" CHECK ("users"."email" ~ '^[^@[:space:]]+@[^@[:space:]]+$' AND char_length("users"."email") <= 254)
);
--> statement-breakpoint
CREATE TABLE "draft_state" (
	"post_id" uuid PRIMARY KEY NOT NULL,
	"base_revision_id" uuid,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "draft_state_version_check" CHECK ("draft_state"."version" >= 0),
	CONSTRAINT "draft_state_title_check" CHECK (char_length("draft_state"."title") BETWEEN 1 AND 200
        AND position(chr(10) in "draft_state"."title") = 0
        AND position(chr(13) in "draft_state"."title") = 0),
	CONSTRAINT "draft_state_body_length_check" CHECK (octet_length("draft_state"."body_markdown") BETWEEN 1 AND 102400)
);
--> statement-breakpoint
CREATE TABLE "post_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"title" text NOT NULL,
	"body_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_revisions_id_post_unique" UNIQUE("id","post_id"),
	CONSTRAINT "post_revisions_title_check" CHECK (char_length("post_revisions"."title") BETWEEN 1 AND 200
        AND position(chr(10) in "post_revisions"."title") = 0
        AND position(chr(13) in "post_revisions"."title") = 0),
	CONSTRAINT "post_revisions_body_length_check" CHECK (octet_length("post_revisions"."body_markdown") BETWEEN 1 AND 102400)
);
--> statement-breakpoint
CREATE TABLE "post_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_slug_history_post_slug_unique" UNIQUE("post_id","slug"),
	CONSTRAINT "post_slug_history_slug_format_check" CHECK ("post_slug_history"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("post_slug_history"."slug") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_revision_id" uuid,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "posts_publication_slug_unique" UNIQUE("publication_id","slug"),
	CONSTRAINT "posts_status_check" CHECK ("posts"."status" IN ('draft', 'published', 'deleted')),
	CONSTRAINT "posts_slug_format_check" CHECK ("posts"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("posts"."slug") BETWEEN 1 AND 64),
	CONSTRAINT "posts_published_pointer_check" CHECK (("posts"."status" = 'published') = ("posts"."published_revision_id" IS NOT NULL)),
	CONSTRAINT "posts_deleted_at_check" CHECK (("posts"."status" = 'deleted') = ("posts"."deleted_at" IS NOT NULL)),
	CONSTRAINT "posts_published_at_check" CHECK ("posts"."status" <> 'published' OR "posts"."published_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "publication_slug_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"publication_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_slug_history_publication_slug_unique" UNIQUE("publication_id","slug"),
	CONSTRAINT "publication_slug_history_slug_format_check" CHECK ("publication_slug_history"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("publication_slug_history"."slug") BETWEEN 1 AND 64)
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"bio" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publications_owner_unique" UNIQUE("owner_id"),
	CONSTRAINT "publications_slug_unique" UNIQUE("slug"),
	CONSTRAINT "publications_slug_format_check" CHECK ("publications"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("publications"."slug") BETWEEN 1 AND 64),
	CONSTRAINT "publications_slug_reserved_check" CHECK ("publications"."slug" NOT IN ('about','admin','api','edit','health','login','new','p','privacy','rss','search','settings','sign-in','sign-up','sitemap','terms','topics','_next')),
	CONSTRAINT "publications_name_length_check" CHECK (char_length("publications"."name") BETWEEN 1 AND 80),
	CONSTRAINT "publications_bio_length_check" CHECK ("publications"."bio" IS NULL OR char_length("publications"."bio") <= 500)
);
--> statement-breakpoint
CREATE TABLE "post_topics" (
	"post_id" uuid NOT NULL,
	"topic_id" uuid NOT NULL,
	CONSTRAINT "post_topics_pk" PRIMARY KEY("post_id","topic_id")
);
--> statement-breakpoint
CREATE TABLE "topics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "topics_slug_unique" UNIQUE("slug"),
	CONSTRAINT "topics_slug_format_check" CHECK ("topics"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length("topics"."slug") BETWEEN 1 AND 64),
	CONSTRAINT "topics_name_length_check" CHECK (char_length("topics"."name") BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	"subject_user_id" uuid,
	"target_type" text,
	"target_id" text,
	"request_id" text NOT NULL,
	"ip_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "audit_events_outcome_check" CHECK ("audit_events"."outcome" IN ('ok', 'denied', 'failed')),
	CONSTRAINT "audit_events_actor_kind_check" CHECK ("audit_events"."actor_kind" IN ('user', 'admin', 'system', 'anonymous')),
	CONSTRAINT "audit_events_action_check" CHECK (char_length("audit_events"."action") BETWEEN 1 AND 80 AND "audit_events"."action" ~ '^[a-z][a-z0-9_.]*$'),
	CONSTRAINT "audit_events_request_id_check" CHECK (char_length("audit_events"."request_id") BETWEEN 1 AND 64),
	CONSTRAINT "audit_events_metadata_size_check" CHECK (octet_length("audit_events"."metadata"::text) <= 1032)
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "rate_limit_counters_pk" PRIMARY KEY("key","window_start"),
	CONSTRAINT "rate_limit_counters_count_check" CHECK ("rate_limit_counters"."count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "draft_state" ADD CONSTRAINT "draft_state_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_state" ADD CONSTRAINT "draft_state_base_revision_fk" FOREIGN KEY ("base_revision_id","post_id") REFERENCES "public"."post_revisions"("id","post_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_revisions" ADD CONSTRAINT "post_revisions_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_slug_history" ADD CONSTRAINT "post_slug_history_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_published_revision_fk" FOREIGN KEY ("published_revision_id","id") REFERENCES "public"."post_revisions"("id","post_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_slug_history" ADD CONSTRAINT "publication_slug_history_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "public"."publications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_topics" ADD CONSTRAINT "post_topics_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "draft_state_base_revision_idx" ON "draft_state" USING btree ("base_revision_id");--> statement-breakpoint
CREATE INDEX "post_revisions_post_created_idx" ON "post_revisions" USING btree ("post_id","created_at");--> statement-breakpoint
CREATE INDEX "post_slug_history_slug_idx" ON "post_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "posts_feed_idx" ON "posts" USING btree ("published_at","id") WHERE "posts"."status" = 'published';--> statement-breakpoint
CREATE INDEX "posts_publication_feed_idx" ON "posts" USING btree ("publication_id","published_at","id") WHERE "posts"."status" = 'published';--> statement-breakpoint
CREATE INDEX "posts_publication_status_idx" ON "posts" USING btree ("publication_id","status");--> statement-breakpoint
CREATE INDEX "posts_published_revision_idx" ON "posts" USING btree ("published_revision_id");--> statement-breakpoint
CREATE INDEX "publication_slug_history_slug_idx" ON "publication_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "post_topics_topic_idx" ON "post_topics" USING btree ("topic_id");--> statement-breakpoint
CREATE INDEX "audit_events_occurred_at_idx" ON "audit_events" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_actor_idx" ON "audit_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "rate_limit_counters_expires_at_idx" ON "rate_limit_counters" USING btree ("expires_at");