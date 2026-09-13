import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsernameToUsers1725880000003 implements MigrationInterface {
  name = 'AddUsernameToUsers1725880000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('users', 'username');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" character varying;`,
      );
    }
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_username" ON "users" (LOWER("username"));`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_username";`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "username";`);
  }
}
