CREATE TABLE "vertical_category_weights" (
	"booker_vertical" "booker_vertical" NOT NULL,
	"category_id" uuid NOT NULL,
	"weight" numeric(4, 3) NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vertical_category_weights_booker_vertical_category_id_pk" PRIMARY KEY("booker_vertical","category_id"),
	CONSTRAINT "vertical_category_weights_range" CHECK ("vertical_category_weights"."weight" >= 0 AND "vertical_category_weights"."weight" <= 1)
);
--> statement-breakpoint
ALTER TABLE "vertical_category_weights" ADD CONSTRAINT "vertical_category_weights_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vertical_category_weights" ADD CONSTRAINT "vertical_category_weights_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vertical_category_weights_category_id_idx" ON "vertical_category_weights" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "vertical_category_weights_updated_by_idx" ON "vertical_category_weights" USING btree ("updated_by");--> statement-breakpoint
-- Default-deny (0000/0001): RLS on, no policies; castly_api bypasses RLS.
ALTER TABLE "vertical_category_weights" ENABLE ROW LEVEL SECURITY;
