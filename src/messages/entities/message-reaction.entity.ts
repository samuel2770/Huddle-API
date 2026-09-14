import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  type Relation,
} from 'typeorm';
import { Message } from './message.entity.js';
import { User } from '../../users/entities/user.entity.js';

@Entity('message_reactions')
@Unique(['message_id', 'user_id', 'emoji'])
export class MessageReaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  message_id: string;

  @ManyToOne(() => Message, (message) => message.reactions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'message_id' })
  message: Relation<Message>;

  @Column({ type: 'uuid' })
  user_id: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'varchar', length: 32 })
  emoji: string;

  @CreateDateColumn({ type: 'timestamp' })
  created_at: Date;
}
