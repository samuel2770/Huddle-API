import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable1725880000000 implements MigrationInterface {
  name = 'CreateUsersTable1725880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`);
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "public"."users_status_enum" AS ENUM('online', 'offline', 'away');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "full_name" character varying NOT NULL,
        "email" character varying NOT NULL,
        "password_hash" character varying NOT NULL,
        "avatar_url" character varying,
        "is_email_verified" boolean NOT NULL DEFAULT false,
        "status" "public"."users_status_enum" NOT NULL DEFAULT 'offline',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "users";`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."users_status_enum";`,
    );
  }
}
