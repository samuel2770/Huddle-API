import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  type Relation,
} from 'typeorm';
import { Message } from './message.entity.js';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  message_id: string;

  @ManyToOne(() => Message, (message) => message.attachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: Relation<Message>;

  @Column({ type: 'varchar' })
  url: string;

  @Column({ type: 'varchar' })
  file_type: string;

  @Column({ type: 'int' })
  file_size: number;

  @Column({ type: 'varchar', nullable: true })
  file_name: string | null;
}
