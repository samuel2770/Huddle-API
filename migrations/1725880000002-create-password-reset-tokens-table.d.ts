import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreatePasswordResetTokensTable1725880000002 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
