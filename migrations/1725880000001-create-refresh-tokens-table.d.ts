import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class CreateRefreshTokensTable1725880000001 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
