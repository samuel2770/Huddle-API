import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialHuddleSchema1726000000000 implements MigrationInterface {
  name = 'InitialHuddleSchema1726000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enums
    await queryRunner.query(
      `CREATE TYPE "user_status_enum" AS ENUM ('online', 'offline', 'away');`,
    );
    await queryRunner.query(
      `CREATE TYPE "workspace_role_enum" AS ENUM ('owner', 'admin', 'member');`,
    );
    await queryRunner.query(
      `CREATE TYPE "channel_type_enum" AS ENUM ('public', 'private', 'dm');`,
    );

    // 2. Users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "full_name" varchar NOT NULL,
        "email" varchar NOT NULL,
        "username" varchar,
        "password_hash" varchar NOT NULL,
        "avatar_url" varchar,
        "is_email_verified" boolean NOT NULL DEFAULT false,
        "status" "user_status_enum" NOT NULL DEFAULT 'offline',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    // Explicit unique index on email
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_email" ON "users" ("email");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_users_username" ON "users" ("username");`,
    );

    // 3. Workspaces table
    await queryRunner.query(`
      CREATE TABLE "workspaces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar NOT NULL,
        "slug" varchar NOT NULL,
        "logo_url" varchar,
        "owner_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_workspaces_slug" ON "workspaces" ("slug");`,
    );

    // 4. Workspace Members table
    await queryRunner.query(`
      CREATE TABLE "workspace_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "role" "workspace_role_enum" NOT NULL DEFAULT 'member',
        "joined_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_workspace_members_workspace_user" ON "workspace_members" ("workspace_id", "user_id");`,
    );

    // 5. Channels table
    await queryRunner.query(`
      CREATE TABLE "channels" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "name" varchar(80) NOT NULL,
        "description" text,
        "topic" text,
        "type" "channel_type_enum" NOT NULL DEFAULT 'public',
        "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "is_archived" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_channels_workspace_name" ON "channels" ("workspace_id", "name");`,
    );

    // 6. Messages table (created before channel_members to support FK)
    await queryRunner.query(`
      CREATE TABLE "messages" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
        "sender_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "content" text,
        "reply_to_message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
        "is_edited" boolean NOT NULL DEFAULT false,
        "is_deleted" boolean NOT NULL DEFAULT false,
        "deleted_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    // Explicit performance index on messages(channel_id, created_at DESC)
    await queryRunner.query(
      `CREATE INDEX "idx_messages_channel_created_desc" ON "messages" ("channel_id", "created_at" DESC);`,
    );

    // 7. Channel Members table
    await queryRunner.query(`
      CREATE TABLE "channel_members" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "last_read_message_id" uuid REFERENCES "messages"("id") ON DELETE SET NULL,
        "unread_count" int NOT NULL DEFAULT 0,
        "joined_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
    // Explicit unique index on channel_members(channel_id, user_id)
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_channel_members_channel_user" ON "channel_members" ("channel_id", "user_id");`,
    );

    // 8. Attachments table
    await queryRunner.query(`
      CREATE TABLE "attachments" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
        "url" varchar NOT NULL,
        "file_type" varchar NOT NULL,
        "file_size" int NOT NULL,
        "file_name" varchar
      );
    `);

    // 9. Refresh Tokens table
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" varchar NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "revoked" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "attachments" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channel_members" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "messages" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "channels" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspace_members" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workspaces" CASCADE;`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE;`);
    await queryRunner.query(`DROP TYPE IF EXISTS "channel_type_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "workspace_role_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status_enum";`);
  }
}
